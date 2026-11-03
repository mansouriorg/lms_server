# Starts this app's local database lms and brings it up to date: the
# migrations of prisma/migrations are applied with prisma migrate deploy
# (additive), only after scripts/db-guard.mjs checked that the database is
# empty or already this app's. Its address comes from `prisma dev ls`
# (scripts/lms-db-url.mjs). Run from the server folder:
#   pnpm -s db:setup
# server/.env is only read (to tell whether it points to lms), never written.
hide() { sed -E 's#://[^@/ ]+@#://(user hidden)@#g; s#api_key=[^ &"]+#api_key=(hidden)#g'; }

echo "--- The local database lms"
LMS_URL="$(node scripts/lms-db-url.mjs 2>/dev/null)"
if [ -z "$LMS_URL" ]; then
  echo "lms is not running: starting it (prisma dev --name lms, in the background)"
  pnpm -s db:start 2>&1 | grep -vE '^[[:space:]]*$' | hide | head -20
  i=0
  while [ $i -lt 20 ] && [ -z "$LMS_URL" ]; do
    sleep 1
    LMS_URL="$(node scripts/lms-db-url.mjs 2>/dev/null)"
    i=$((i + 1))
  done
fi
if [ -z "$LMS_URL" ]; then
  echo "STOPPED: the database lms did not start, nothing was applied."
  exit 1
fi
PORT="${LMS_URL#*@localhost:}"
PORT="${PORT%%/*}"
ready=no
i=0
while [ $i -lt 30 ]; do
  if (exec 3<>/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null; then ready=yes; break; fi
  sleep 1
  i=$((i + 1))
done
echo "lms is running; its database answers on port $PORT: $ready"
if [ "$ready" != yes ]; then
  echo "STOPPED: nothing was applied."
  exit 1
fi

echo
echo "--- Safety check: the database of lms is new, or already this app's"
if LMS_URL="$LMS_URL" node scripts/db-guard.mjs; then
  :
else
  echo "STOPPED: nothing was applied."
  exit 1
fi

echo
echo "--- Apply the migrations (prisma migrate deploy, additive)"
DATABASE_URL="$LMS_URL" pnpm exec prisma migrate deploy 2>&1 | grep -vE '^[[:space:]]*$' | hide | head -40
echo
echo "--- Migration status (read only)"
DATABASE_URL="$LMS_URL" pnpm exec prisma migrate status 2>&1 | grep -vE '^[[:space:]]*$' | hide | head -20
echo
echo "--- server/.env (read only)"
node scripts/lms-db-url.mjs --env
