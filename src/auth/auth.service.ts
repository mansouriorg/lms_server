import { 
  Injectable, 
  ConflictException, 
  InternalServerErrorException, 
  UnauthorizedException, 
  Logger 
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as argon2 from 'argon2';
import { BadRequestException } from '@nestjs/common';
import { ChangePasswordDto } from './dto/change-password.dto';
import { TERMS_CHANGED, TERMS_VERSION } from '../config/legal';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // The page showed an older version of the terms: they must be read again
    if (dto.termsVersion !== TERMS_VERSION) {
      throw new BadRequestException(TERMS_CHANGED);
    }
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (existingUser) {
        throw new ConflictException('An account already exists with this email address.');
      }

      const hashedPassword = await argon2.hash(dto.password);

      const newUser = await this.prisma.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          // Accepted on the sign-up page, in the version checked above
          termsAcceptedAt: new Date(),
          termsVersion: TERMS_VERSION,
          // FIXED: Matches your schema's 'passwordHash' field perfectly
          passwordHash: hashedPassword, 
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      });

      return {
        message: 'Account created.',
        user: newUser,
      };

    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Registration error: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Could not create the account. Please try again.');
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Incorrect email or password.');
    }

    // FIXED: Reads from user.passwordHash instead of user.password
    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Incorrect email or password.');
    }

    const payload = { 
      sub: user.id, 
      email: user.email,
      role: user.role 
    };

    return {
      message: 'Signed in.',
      // ver: the token stops working when the password changes
      access_token: this.jwtService.sign({
        ...payload,
        ver: user.tokenVersion,
      }),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      }
    };
  }

  // POST /auth/change-password: the current password must be right, and the
  // new one different (400 otherwise, shown under the form). Only the hash is
  // stored. The tokens given before stop working (other browsers and devices
  // are signed out); the answer holds a new token for this one.
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (user === null) {
      throw new UnauthorizedException('Please sign in again.');
    }

    const isCurrentValid = await argon2.verify(
      user.passwordHash,
      dto.currentPassword,
    );
    if (isCurrentValid === false) {
      throw new BadRequestException('Your current password is not correct.');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'Choose a new password that is different from the current one.',
      );
    }

    const changed = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(dto.newPassword),
        tokenVersion: { increment: 1 },
      },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });
    return {
      message: 'Password changed.',
      access_token: this.tokenFor(changed),
    };
  }

  // POST /auth/sign-out-others: every other browser and device is signed out
  // (their tokens hold an older tokenVersion and get a 401); the answer holds
  // a new token for this one. The account exists: JwtStrategy checked it.
  async signOutOthers(userId: string) {
    const account = await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });
    return {
      message: 'Your other browsers and devices are signed out.',
      access_token: this.tokenFor(account),
    };
  }

  // A sign-in token whose ver is the account's tokenVersion: it stops working
  // at the next password change or "sign out everywhere else"
  private tokenFor(account: {
    id: string;
    email: string;
    role: string;
    tokenVersion: number;
  }): string {
    return this.jwtService.sign({
      sub: account.id,
      email: account.email,
      role: account.role,
      ver: account.tokenVersion,
    });
  }
}