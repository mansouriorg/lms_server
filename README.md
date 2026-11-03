<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Environment variables

Copy `.env.example` to `.env` and fill it in. The server checks the variables when it starts (`src/config/env.schema.ts`) and refuses to start if one is missing or wrong. `JWT_SECRET` must be at least 32 random characters; `openssl rand -hex 32` makes one. Changing it signs everyone out.

## Local database (development)

- The app has its own local database: Prisma's local Postgres (`prisma dev`) named `lms`. Prisma chose its ports when it created it (on this computer: 51217 to 51220, the database itself on 51218); `scripts/lms-db-url.mjs` reads them from `prisma dev ls`, so no port is written in the project. `pnpm -s db:start` starts it in the background, `pnpm -s db:stop` stops it, `pnpm -s db:list` lists the local databases. Prisma keeps their data in its own folder on the computer, not in the project.
- `.env` points to it with the direct address, because the API reaches the database through the `pg` driver, which cannot use the `prisma+postgres://` kind: `DATABASE_URL="postgres://postgres:postgres@localhost:51218/template1?sslmode=disable"` (the user and the password are the fixed ones of Prisma's local database; `pnpm -s db:setup` tells whether `.env` points to `lms`).
- Do not use the local database named `default` for this app: on this computer it holds the tables of another project.
- `pnpm -s db:setup` (`scripts/setup-local-db.sh`) starts `lms` if needed, checks that it is empty or already this app's (`scripts/db-guard.mjs`, read only: it stops when it finds migrations of another project), then applies the missing migrations with `prisma migrate deploy` (additive) and shows their status. Run it again after an update that adds a migration.
- Never `pnpm exec prisma migrate dev` on a database with data: it can offer to reset it, which deletes everything.

## The first platform admin

Sign-up only creates students, and only a platform admin (`SUPER_ADMIN`) can create academies, so the first one is made from the terminal (`scripts/make-platform-admin.mjs`, on the database of `DATABASE_URL`):

- `pnpm -s admin:make` shows how many accounts and platform admins there are (read only).
- `pnpm -s admin:make you@example.com` shows what would change for that account (read only); `pnpm -s admin:make you@example.com --yes` changes only its role. Then reload the app in your browser: it opens the admin space (the role is read on every request, see Sign-in and roles).
- It stops when the database does not hold this app's accounts, when the account does not exist, or when it is already a platform admin. Emails are printed masked (`y***@example.com`). Its helpers are tested by `pnpm -s test:scripts`.

## Web app sites (CORS)

`FRONTEND_URLS` lists the web app sites that may call the API from a browser, separated by commas (for example `https://lms.example.com, https://www.lms.example.com`). Spaces, capitals and a final `/` do not matter.

- A page from any other site gets a 403 "This website is not allowed to use the API." (in the usual error shape), and the request never reaches a route. If your own web app gets this answer, add its address to `FRONTEND_URLS`.
- Requests without an `Origin` header (curl, another server, a mobile app) and the API's own pages (the documentation at `/api`) are answered as usual.
- The rules live in `src/config/cors.ts`, tested by `src/config/cors.spec.ts` (with real HTTP requests).

## API documentation (Swagger)

The API documentation lists every route and the shape of every request. It is served at `/api` (for example http://localhost:3001/api) in development and test. It is off when `NODE_ENV=production`, because it is also a map of the API for an attacker.

- To show it in production anyway, add `API_DOCS=on` to the server environment; `API_DOCS=off` hides it everywhere. Any other value stops the server when it starts.
- The rule lives in `src/config/api-docs.ts`, tested by `src/config/api-docs.spec.ts`.

## Error responses

Every error has the same JSON shape, and `message` is one readable sentence the web app can show as it is: `{ statusCode, message, errors?, path, timestamp }`. `errors` lists each message when there are several (validation errors). Unexpected errors only return a generic message; the details go to the server log. All messages are in English.

## Rate limits

Each IP address may send 300 requests per minute, and 10 per minute to `POST /auth/login` and `POST /auth/register` (password guessing, fake accounts). Over the limit the server answers 429 until the minute is over. The numbers live in `src/config/rate-limits.ts`.

## Payments (manual for now)

An order starts as `PENDING`. When the student has paid (cash or bank transfer), an admin calls `PATCH /orders/:id/mark-paid`; the order becomes `PAID`, which unlocks its courses and download links. A center admin can only confirm orders whose items all belong to their academy; a super admin can confirm any order. Coupon uses are counted at that moment, not when the order is created. An online payment provider can call the same logic later.

## Amounts (TND, in millimes)

- Prices and totals are Tunisian dinars with at most 3 decimals (the millimes). The course and digital product forms refuse more decimals (400).
- At checkout, the discount of a coupon and the total of the order are rounded to the nearest millime (`src/common/money.ts`, a half millime goes up), so an order never asks for a part of a millime: 15% off 199.999 TND is 30 TND off, and the order is 169.999 TND.
- Tests: `src/common/money.spec.ts`, `src/orders/coupon-discount.spec.ts`, `src/orders/orders.coupons.spec.ts`.

## What a student can order

`POST /orders` refuses a draft or cancelled course with a 404, as if it did not exist (they are out of the catalog), and a full or finished course with a 409 ("... is full: it cannot be ordered anymore."). It also refuses a second order for a course or digital product that is still waiting for payment (409): otherwise two pending orders for the same course could both be marked as paid.

## Public course catalog

`GET /stages` and `GET /stages/:id` work without signing in (`OptionalJwtAuthGuard`): visitors get the published courses and their outline, never the lesson video links, even for a free course. With a valid token the answer is the same as before (admins see drafts, buyers get the video links). An expired or invalid token is treated like no token. Creating, editing and deleting courses still need a token and an admin role (`JwtAuthGuard` and `RolesGuard` on each route).

## My courses and progress

`GET /stages/mine` (signed in) lists the courses of the student's PAID orders, each once, newest purchase first, also the ones that were cancelled later (buyers keep access; `status` says so), with `totalLessons`, `completedLessons` and `percentage`. It is declared before `GET /stages/:id` so that "mine" is not read as a course ID. `GET /lessons/stage/:stageId/progress` now also sends `completedLessonIds`, so the course player can mark each completed lesson; `POST /lessons/:id/complete` records one (409 when it already was).

## Course management (admins)

- `GET /stages/manage` lists the courses of the admin's academy whatever their status (every course for a super admin), with `_count.modules` and `_count.orderItems` (order lines of PAID orders, the paid enrollments).
- `GET /stages/:id/manage` returns one course for its editor, with the lesson video links and the paid enrollments; 403 for an admin of another academy.
- `POST /stages`: `centerId` and `instructorId` are optional. An academy admin creates the course in their own academy and is its instructor; a super admin must give `centerId` (400 otherwise). A new course is a draft.
- `DELETE /stages/:id` refuses a course that was ordered (409): set its status to `CANCELLED` instead, so orders and buyers keep their history.

## Students of an academy (admins)

`GET /stages/students` (academy admins and super admins) lists everyone with a PAID order for a course of the admin's academy (every academy for a super admin), the newest student first: name, email, phone, `since` (their first order), `lastActivityAt` (the last lesson they completed) and `courses`: each course they bought, once, with `since`, `totalLessons`, `completedLessons`, `percentage` and `lastActivityAt`. Only the lessons of a course they bought count. It is declared before `GET /stages/:id`; 403 for an admin account without an academy.

`GET /stages/:id/lesson-progress` (admins of the course's academy, 403 for the others, 404 for an unknown course) answers `{ students, finished, modules: [{ id, title, lessons: [{ id, title, duration, completed }] }] }`: the modules and lessons in their order, `completed` being how many of the course's students completed the lesson, `students` how many students the course has (its buyers, and the student accounts that completed one of its lessons: a free course has no orders; an admin trying a lesson does not count) and `finished` how many of them completed every lesson.

## Course program (modules and lessons)

- `POST /modules` `{ stageId, title }` adds a module at the end of a course; `PATCH /modules/:id` `{ title }` renames it; `DELETE /modules/:id` deletes it with its lessons (the database also deletes the students' progress and questions on those lessons).
- `POST /lessons` `{ moduleId, title, videoUrl?, duration?, description?, order? }`: without `order`, the lesson goes after the last one of its module. `videoUrl` must be a full `https://` (or `http://`) address; `duration` is in minutes (1 to 1440). `PATCH /lessons/:id` with `null` removes the video link or the duration.
- `POST /modules/:id/move` and `POST /lessons/:id/move` with `{ "direction": "up" }` or `"down"` move one place; the modules of the course (or the lessons of the module) are then numbered 1, 2, 3... in one transaction.
- Admins only, for the courses of their own academy (403 otherwise; every academy for a super admin). Module and lesson titles are trimmed, not passed through sanitize-html: the client shows them as text.

## Quizzes (admins)

Each module can have a quiz (the `QuizQuestion` table, already in the schema: no database change). Every route needs an academy admin or super admin, and a course of the admin's academy (403 otherwise, 404 when unknown):

- `GET /quiz-questions/course/:stageId`: the modules of the course in their order, each with `quizBank`, its questions (the oldest first) with the right answer and the explanation.
- `POST /quiz-questions` `{ moduleId, text, type, difficulty?, options?, correctAnswer, explanation? }`: `type` is `MULTIPLE_CHOICE` (2 to 6 different answers, each at most 200 characters) or `TRUE_FALSE` (the answers are always "True" and "False"); `correctAnswer` is the place of the right answer, from 0 (400 when it is not one of the answers); `difficulty` is `EASY`, `MEDIUM` (the default) or `HARD`; texts are trimmed, an empty explanation is none. At most 50 questions per module.
- `PATCH /quiz-questions/:id` takes the same fields without `moduleId` (the whole question again); `DELETE /quiz-questions/:id` deletes one.
- `GET /quiz-questions/course/:stageId/results`: `{ modules: [{ id, title, questions }], students: [{ id, firstName, lastName, email, results: [{ moduleId, best, attempts }] }] }`, the modules of the course in their order and its students: its buyers (paid orders) and the student accounts that finished one of its quizzes (a free course has no orders); the quizzes an admin took to try them are left out. `results` holds each module quiz the student finished, with their best score (as for the students below).

## Quizzes (students)

For every signed-in user who may open the course (its buyers, the admins of its academy; anyone signed in for a free course), like the lessons: 404 when the course is hidden from them, 403 when they did not buy it.

- `GET /quizzes/module/:moduleId`: `{ module: { id, title }, questions }`, the questions (the oldest first) with their possible answers but **without** the right answer and the explanation.
- `POST /quizzes/questions/:id/check` `{ answer }` (the place of the answer chosen, from 0): `{ right, correctAnswer, explanation }` (200; 400 when `answer` is not one of the answers). Nothing is stored for a single answer; the finished quiz is saved (see below).
- `GET /stages/:id` now sends `_count.quizBank` with each module, so the course player knows which modules have a quiz.
- Saved scores (the table `QuizAttempt`, added by the migration `20261101190000_quiz_attempts`): `POST /quizzes/module/:moduleId/attempts` `{ answers: [{ questionId, answer }] }` takes one answer per question of the quiz; the server grades them, saves the score and answers `{ correct, total, percentage, best, attempts }` (201). 400 when the quiz changed meanwhile (an answer missing, twice or unknown) or an answer is not in its list: nothing is saved then.
- `GET /quizzes/module/:moduleId` also sends the student's `best` score (`{ correct, total, percentage, createdAt }`, or null) and number of `attempts`; `GET /quizzes/course/:stageId/results` sends `[{ moduleId, best, attempts }]` for the module quizzes of a course the student finished. The best score is the highest share of right answers (the most recent of equal ones).

## Input cleaning

Text fields are cleaned when a request arrives (the `@Transform` decorators in the DTOs, helpers in `src/common/text.ts`). The client shows every text as text (React escapes it); if a text is ever shown as HTML (an email, say), it must be escaped there.

- Names, cities and phone numbers (sign-up, profile, academy form): `withoutHtml` removes HTML tags and the `<` and `>` characters, keeps `&` as typed ("R&D Academy"), and trims. A value stored as `&amp;` before is fixed when a form sends it again.
- Course, module and lesson texts (title, description, category, level): `trimText` only trims, so code such as `List<T>` or `a && b` is kept.
- Email addresses: `emailText` trims and lowercases.
- A value of the wrong type (a number instead of a name) is left to the validators: 400, not a crash.
- Values saved before this cleaning (names and phones of accounts; academy names, cities and phones; course titles, descriptions, categories and levels) can still hold HTML escapes such as `&amp;`, which the pages show as is. `pnpm -s check:escaped-text` lists them with what each would become (`scripts/check-escaped-text.mjs`). It reads the database of `DATABASE_URL` (`.env`) in a read-only transaction and changes nothing; for people (names, phones) it prints only the record id, never the value. Its helpers are tested by `pnpm -s test:scripts`.

`sanitize-html` is imported with `import * as sanitizeHtml from 'sanitize-html'`: this project does not use `esModuleInterop`, so a default import is undefined at run time.

## Run tests

Unit tests (`pnpm run test`) need no database: every spec replaces Prisma with a stub. Imports that start with `src/` are mapped by `moduleNameMapper` in the Jest config in `package.json`.

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Digital products (admins)

- `POST /products` `{ title, description?, price, fileUrl, isActive? }` adds a product to the admin's academy (platform-wide for a super admin). `PATCH /products/:id` changes any of these fields; only the fields sent change. Both remove HTML from the texts; `price` is in TND with at most 3 decimals; `fileUrl` is an http or https link (a link without `https://` is accepted).
- `GET /products/admin/all` lists the academy's products with `_count.orderItems`, how many times each was ordered. `PATCH /products/:id/toggle` hides or shows a product.
- A new file link also reaches the students who already bought the product; a new price only applies to new orders.

## Coupons (admins)

- `POST /coupons` `{ code, discountPercentage? | discountAmount?, maxUses?, expiresAt?, isActive? }`: the code is stored in capitals and has 3 to 30 letters, digits, `-` or `_`; exactly one of a percentage (1 to 100) or a fixed amount in TND (at least 1); `maxUses` a whole number; `expiresAt` the last moment the code works, not already past (400).
- `GET /coupons` lists the academy's coupons with `usedCount` (paid orders) and `_count.orders` (every order that used the code). `PATCH /coupons/:id/toggle` pauses or resumes one.
- `DELETE /coupons/:id` deletes a coupon no order used; a used one answers 409 (the order keeps its discount): pause it instead.

## Paid download links

A digital product's `fileUrl` is its paid download link. `GET /products` and `GET /products/:id` never include it (and only show active products). These two routes are the store: open to everyone, signed in or not, with the academy's name and contact details (`center`). A student gets it from `GET /orders/my-orders`, and only for orders with status `PAID`; unpaid, failed and refunded orders show `fileUrl: null`. Admins still see it in `GET /products/admin/all`.

A product that was ordered cannot be deleted (`DELETE /products/:id` answers 409): its buyers would lose their download link. Hide it from the store instead with `PATCH /products/:id/toggle`: buyers keep their link, and nobody new can buy it. (Courses follow the same rule: an ordered course is cancelled, not deleted.)

## Course access

- `GET /stages` and `GET /centers/:id`: everyone sees the published courses (`ACTIVE`, `FULL`, `COMPLETED`); a center admin also sees the `DRAFT` and `CANCELLED` courses of their own academy, a super admin every course (`visibleCoursesWhere`). Order counts are for super admins only.
- `GET /centers` and `GET /centers/:id` are public too, like the catalog (no token needed). `GET /centers` lists the academies by name; its course count (`_count.stages`) only counts the published courses.
- `GET /stages/:id`: everyone sees the outline, but lesson `videoUrl`s are only sent when `hasAccess` is `true`; otherwise they are `null`. A draft or cancelled course is a 404, except for the admins of its academy, super admins and the students who bought it: buyers keep access when a course is cancelled (`canSeeCourse`).
- `FULL` and `COMPLETED` courses stay in the catalog but take no new orders (`CLOSED_FOR_ORDERS`).
- `GET /lessons/module/:moduleId` and `POST /lessons/:id/complete`: 403 unless the user can open the course.
- Who can open a course: super admins, admins of the academy that owns it, users with a `PAID` order for it, and everyone when the course is free (price 0). The rules live in `src/common/course-access.ts`.

## Questions and answers (Q&A)

Every `/questions` route needs a token, and the user must be able to open the lesson's course (the same rule as the lessons, `assertCanOpenCourse`): 404 for an unknown lesson or question, or a course they cannot see; 403 when they have not bought it.

- `GET /questions/lesson/:lessonId`: the questions of a lesson, newest first, with their answers.
- `GET /questions/inbox` (academy admins and super admins): the questions on the courses of the admin's academy (every academy for a super admin), not resolved first, then the newest (at most 200), with their answers and the lesson and course they belong to. 403 for an admin account without an academy.
- `POST /questions` `{ lessonId, title, body }` and `POST /questions/reply` `{ questionId, body }`: titles have 5 to 150 characters, texts at most 5000; they are trimmed.
- `PATCH /questions/:questionId/replies/:replyId/accept`: the author of the question, or an admin of the course's academy. The answer must belong to that question (404 otherwise); the previous accepted answer is unmarked, and the question is resolved (one transaction).

## My profile

- `GET /users/me` and `PATCH /users/me`: only the user of the token. The profile form changes `firstName`, `lastName` (required when sent, at most 50 characters) and `phone` (digits, spaces and `+ ( ) . -`, 6 to 25 characters; an empty phone removes it). The email, the role and the academy cannot be changed there (400).
- `POST /auth/change-password` `{ currentPassword, newPassword }` (signed-in users): 400 when the current password is wrong or the new one is the same; the new one needs 8 to 128 characters and is stored hashed with argon2. 10 tries per minute, like sign-in. Tokens already given stay valid until they expire (1 day).

## Accepting the terms

The columns `termsAcceptedAt` and `termsVersion` of `User` come with the migration `20261101210000_terms_acceptance`. Accounts created before it keep `null`: they have not accepted the published texts yet.

- `POST /auth/register` also needs `acceptTerms: true` (the sign-up checkbox: 18 or older, Terms of Service and Privacy Policy) and `termsVersion`, the date of the texts the page showed. The account records when and which version. A version other than `TERMS_VERSION` (`src/config/legal.ts`) is refused (400 "...changed since this page was opened..."), so nobody accepts a text they did not see.
- `GET /users/me` also answers `termsVersion` and `termsAcceptedAt`.
- `POST /users/me/terms` `{ acceptTerms: true, termsVersion }` (signed-in users): records the acceptance of the current version, once (accepting again keeps the first date); 400 for another version.
- When the texts change, change `TERMS_VERSION` here and `LEGAL_UPDATED` in `client/lib/legal.ts` together: `src/auth/terms.spec.ts` checks that they are the same.

## Sign-in and roles

- `POST /auth/login` gives a token that lasts 1 day. On every request, `src/auth/jwt.strategy.ts` checks it, then reads the account again (`id`, `email`, `role`): a role given or taken away counts from the next request, not when the token expires (an academy admin added or removed, a platform admin made with `admin:make`). This costs one read of the account, by its id, per signed-in request.
- A token of a deleted account, or one without an account id, gets a 401: "Your sign-in is no longer valid. Please sign in again." On the public routes (the course catalog) such a token counts as no token.
- Changing the password (`POST /auth/change-password`) or resetting it with a link (`POST /auth/reset-password`) raises the account's `tokenVersion` (migration `20261102000000_token_version`). Every token holds the version of its time (`ver`); a token with an older one gets the same 401, so the other browsers and devices are signed out. The answer of `POST /auth/change-password` holds a new token (`access_token`) for the browser that changed it. The tokens given before this column existed count as version 0.
- `POST /auth/sign-out-others` (signed in, 10 per minute): raises `tokenVersion` without changing the password, so every other browser and device is signed out; the answer holds a new token for this one (**Sign out everywhere else** in Settings). Tests: `src/auth/sign-out-others.spec.ts`.
- Tests: `src/auth/jwt.strategy.spec.ts`.

## Forgotten passwords

There is no email sending yet, so a platform admin creates the reset link and sends it by hand. The table `PasswordReset` comes with the migration `20261101200000_password_resets`.

- `POST /auth/forgot-password` `{ email }` (anyone, 10 per minute): always 200 with the same message, whether an account uses the email or not. For an existing account (not a platform admin), the request is recorded, once per open reset.
- `GET /auth/password-resets` (platform admins): the resets of the last 30 days, the newest first, with the user (name, email, phone, role, academy) and `state`: `requested`, `link-active`, `link-expired` or `used`. Check who asked (by phone, say) before creating a link.
- `POST /auth/password-resets/:id/link` (platform admins): a new one-time link secret, `{ token, expiresAt }`, valid 24 hours; an earlier link of the reset stops working. Only the sha256 of the secret is stored, so the secret is shown once. 400 for a used reset, 404 for an unknown one.
- `POST /auth/password-resets` `{ email }` (platform admins): starts a reset for that account (or reuses its open one) and answers its link, as above. 404 for an unknown email; platform admin accounts are refused (403).
- `POST /auth/reset-password` `{ token, password }` (anyone, 10 per minute): sets the new password (8 to 128 characters) once, before the link expires; the other open resets of the account are closed. Otherwise 400 "This link does not work any more". Tokens already given stay valid until they expire (1 day).

## Course projects (assignments)

The column `projectBrief` of `Stage` comes with the migration `20261101220000_project_briefs`. A course has a project when its academy wrote a brief: plain text, at most 4000 characters, sent as `projectBrief` with `POST /stages` or `PATCH /stages/:id` (an empty text removes it). The brief is part of the course, like its description.

- `GET /project-submissions/mine` (signed-in): the projects of the courses the student bought (paid orders), the newest purchase first, as `{ course: { id, title, center }, brief, submission }`; `submission` is `null` until the project is sent. A course whose project was removed stays when the student had sent it.
- `POST /project-submissions` `{ stageId, repoUrl, liveUrl? }` (students only): full `https://` links, at most 500 characters; an empty `liveUrl` means no link. 403 for a course not bought, 400 for a course without a project, 409 once approved. Sending again after "Needs work" replaces the links and goes back to `PENDING`.
- `GET /project-submissions/admin/pending` (the oldest first) and `GET /project-submissions/admin/reviewed` (the last 100, the newest first): for academy admins (their academy) and platform admins (every academy), each with the student (name, email) and the course (title, brief).
- `PATCH /project-submissions/:id/grade` `{ status, feedback? }`: `status` is `APPROVED` or `NEEDS_WORK`; `NEEDS_WORK` needs feedback (at most 2000 characters).
- Tests: `src/project-submissions/project-submissions.projects.spec.ts`.

## Live sessions (bookings)

A student asks for a mentoring call or a webinar with an admin of an academy whose course they bought. The academy confirms it (status `PAID`, shown as "Confirmed" in the app) with a meeting link, or cancels it.

- `GET /bookings/instructors`: who the student can book: the admins of the academies of the courses they bought (a `PAID` order).
- `POST /bookings` `{ title, type, date, startTime, endTime, instructorId }`: `type` is `MENTORSHIP` or `WEBINAR`, `date` a day like `2026-11-05` (not past), times like `14:00` (the end after the start). 404 for an account that is not an academy admin, 403 for an admin of another academy. Saved as `PENDING`.
- `GET /bookings/my-bookings`: the student's sessions, the soonest first, with the name and academy of who they meet. `PATCH /bookings/:id/cancel`: the student cancels their own session (404 for someone else's).
- `GET /bookings/instructor/my-sessions` (admins): the sessions booked with them, with the student's name, email and phone. `PATCH /bookings/:id/status` `{ status, meetingLink? }`: the host only (or a super admin). `meetingLink` is a web address (http or https, at most 500 characters; spaces around it are removed). A cancelled session stays cancelled: confirming or cancelling it again is a 400 (only `REFUNDED` can still be recorded).

## Academy ownership

A center admin manages only the academy (`centerId`) of their own account; a super admin manages every academy. The rules live in `src/common/academy-scope.ts`.

- Courses (`POST/PATCH/DELETE /stages`) and lessons (`POST/PATCH/DELETE /lessons`): own academy only, and nothing can be moved to another academy.
- `POST /centers` and `DELETE /centers/:id`: super admins only. An academy can only be deleted when it has no courses, digital products, coupons or admins (409 otherwise, with what is left): deleting it turned its coupons and products into platform-wide ones, and left its admins as academy admins without an academy. Remove its admins first (`DELETE /centers/:id/admins/:userId`).
- `PATCH /centers/:id`: own academy only. `GET /centers/:id` only shows the draft and cancelled courses to the academy's own admins (and super admins).
- `GET /project-submissions/admin/pending` and `PATCH /project-submissions/:id/grade`: own academy only.
- `GET /orders/admin/all`: center admins only see orders that contain one of their courses.
- `PATCH /bookings/:id/status`: only the instructor who hosts the session (or a super admin).
- Coupons and digital products belong to an academy (`centerId`, added by the migration `20261031200000_academy_for_coupons_and_products`). Center admins only create, list, pause and delete their own; the ones without an academy are platform-wide and only super admins manage them.
- At checkout an academy coupon only discounts that academy's items (`src/orders/coupon-discount.ts`).

### Academy admins (platform admins)

- `GET /centers/admin/overview`: every academy, by name, with its contact details, its numbers of courses (drafts too), digital products and coupons (`_count`), and its admins (`id`, `email`, `firstName`, `lastName`; never a password).
- `POST /centers/:id/admins` `{ email }`: an existing account becomes an admin of the academy (role `CENTER_ADMIN`, linked to it). 404 when the academy or the account does not exist (the person signs up first); 409 for a platform admin, or for an admin of this academy or of another one (remove it there first). The new role counts from the next request (see Sign-in and roles); the app opens the academy space the next time the person loads it.
- `DELETE /centers/:id/admins/:userId`: the account is a student account again, without an academy (404 when it is not an admin of this academy). From the next request, the API treats it as a student (see Sign-in and roles).
- Tests: `src/centers/centers.admins.spec.ts`.

### Applying database migrations

Run `pnpm exec prisma migrate status` first (read only): it lists the migrations that have not run yet. Then `pnpm exec prisma migrate deploy` runs only those; it never resets or deletes data. Do not use `prisma migrate dev` against a database with real data: when it finds differences it can offer to reset the database.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
