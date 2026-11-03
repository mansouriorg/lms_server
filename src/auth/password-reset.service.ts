// src/auth/password-reset.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

// A link works this long after a platform admin creates it
export const RESET_LINK_HOURS = 24;
// The platform admin page lists the resets of the last 30 days
export const RESET_LIST_DAYS = 30;

const HOUR = 60 * 60 * 1000;

// The same answer whether an account uses the email or not, so the form
// cannot tell who has an account
export const FORGOT_ANSWER = {
  message:
    'Thank you. If an account uses this email, the platform team will send you a link to choose a new password.',
};
export const LINK_REFUSED =
  'This link does not work any more: ask for a new one on the Forgot password page.';

// Only the sha256 of a link's secret is stored
export function tokenHashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type ResetState = 'requested' | 'link-active' | 'link-expired' | 'used';

export function resetState(
  reset: { expiresAt: Date | null; usedAt: Date | null },
  now: Date,
): ResetState {
  if (reset.usedAt !== null) return 'used';
  if (reset.expiresAt === null) return 'requested';
  return reset.expiresAt > now ? 'link-active' : 'link-expired';
}

// Forgotten passwords without email sending: the user asks on the Forgot
// password page; a platform admin checks who asked (by phone, say) and
// creates a one-time link, valid 24 hours, that they send by hand; the user
// opens it and chooses a new password. Platform admin accounts are not reset
// this way.
@Injectable()
export class PasswordResetService {
  constructor(private readonly prisma: PrismaService) {}

  private since(days: number) {
    return new Date(Date.now() - days * 24 * HOUR);
  }

  // The open reset of a user (asked or started in the last 30 days, not
  // used), or null
  private openReset(userId: string) {
    return this.prisma.passwordReset.findFirst({
      where: {
        userId,
        usedAt: null,
        createdAt: { gte: this.since(RESET_LIST_DAYS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
  }

  // POST /auth/forgot-password: records the request for the platform admins
  // (once per open reset), and always gives the same answer
  async request(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });
    if (user === null || user.role === 'SUPER_ADMIN') {
      return FORGOT_ANSWER;
    }
    const open = await this.openReset(user.id);
    if (open === null) {
      await this.prisma.passwordReset.create({
        data: { userId: user.id, requestedAt: new Date() },
      });
    } else {
      await this.prisma.passwordReset.update({
        where: { id: open.id },
        data: { requestedAt: new Date() },
      });
    }
    return FORGOT_ANSWER;
  }

  // GET /auth/password-resets: the resets of the last 30 days, the newest
  // first, with who asked (to check it is really them) and the state
  async list() {
    const now = new Date();
    const resets = await this.prisma.passwordReset.findMany({
      where: { createdAt: { gte: this.since(RESET_LIST_DAYS) } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        requestedAt: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            center: { select: { name: true } },
          },
        },
      },
    });
    return resets.map((reset) => ({
      ...reset,
      state: resetState(reset, now),
    }));
  }

  // POST /auth/password-resets/:id/link: a new one-time link for an open
  // reset (an earlier link of it stops working). The secret is only in this
  // answer: the page shows the link once.
  async createLink(id: string) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { id },
      select: { id: true, usedAt: true, user: { select: { role: true } } },
    });
    if (reset === null) {
      throw new NotFoundException('Reset not found.');
    }
    if (reset.usedAt !== null) {
      throw new BadRequestException(
        'This reset is already used: start a new one.',
      );
    }
    if (reset.user.role === 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'A platform admin password cannot be reset here.',
      );
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_LINK_HOURS * HOUR);
    await this.prisma.passwordReset.update({
      where: { id },
      data: { tokenHash: tokenHashOf(token), expiresAt },
    });
    return {
      message: `Link created. Send it to the user: it works once, for ${RESET_LINK_HOURS} hours.`,
      token,
      expiresAt,
    };
  }

  // POST /auth/password-resets: a reset started by a platform admin for the
  // account of an email (the open one when there is one), with its link
  async createForEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });
    if (user === null) {
      throw new NotFoundException('No account uses this email.');
    }
    if (user.role === 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'A platform admin password cannot be reset here.',
      );
    }
    const open = await this.openReset(user.id);
    const reset =
      open ??
      (await this.prisma.passwordReset.create({
        data: { userId: user.id },
        select: { id: true },
      }));
    return this.createLink(reset.id);
  }

  // POST /auth/reset-password: the new password of the link's account. The
  // link works once, before it expires; the other open resets of the account
  // are closed too, and its sign-in tokens stop working.
  async reset(token: string, password: string) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: tokenHashOf(token) },
      select: { id: true, userId: true, usedAt: true, expiresAt: true },
    });
    const now = new Date();
    if (reset === null || resetState(reset, now) !== 'link-active') {
      throw new BadRequestException(LINK_REFUSED);
    }
    const passwordHash = await argon2.hash(password);
    // Claimed once, even when the link is opened twice at the same time
    const claimed = await this.prisma.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(LINK_REFUSED);
    }
    await this.prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await this.prisma.passwordReset.updateMany({
      where: { userId: reset.userId, usedAt: null },
      data: { usedAt: now },
    });
    return { message: 'Your password is changed. You can sign in with it now.' };
  }
}
