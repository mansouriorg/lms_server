import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Actor,
  academyScope,
  assertManagesAcademy,
} from '../common/academy-scope';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { SubmissionStatus } from 'src/generated/prisma/enums';

export const NO_PROJECT = 'This course has no project to send.';
export const FEEDBACK_NEEDED =
  'Say what to change: feedback is needed when you ask for changes.';

// What a student sees of their submission
const SUBMISSION_FIELDS = {
  id: true,
  stageId: true,
  repoUrl: true,
  liveUrl: true,
  status: true,
  feedback: true,
  createdAt: true,
  updatedAt: true,
} as const;

// What the academy sees of a submission: the student and the course
const REVIEW_FIELDS = {
  ...SUBMISSION_FIELDS,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  stage: { select: { id: true, title: true, projectBrief: true } },
} as const;

// Projects of courses (one per student and course): the student sends links
// to their work, the academy approves it or asks for changes. A course has a
// project when its academy wrote a brief (Stage.projectBrief).
@Injectable()
export class ProjectSubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- STUDENTS ---

  // POST /project-submissions: the first sending, or a new one after "Needs
  // work" (back to PENDING). Only for a course the student bought (paid
  // order) and that has a project; an approved project cannot change.
  async submitProject(userId: string, dto: CreateSubmissionDto) {
    const enrollment = await this.prisma.orderItem.findFirst({
      where: {
        stageId: dto.stageId,
        order: { userId, status: 'PAID' },
      },
    });
    if (enrollment === null) {
      throw new ForbiddenException('You have not bought this course.');
    }

    const stage = await this.prisma.stage.findUnique({
      where: { id: dto.stageId },
      select: { projectBrief: true },
    });
    if (stage === null || stage.projectBrief === null) {
      throw new BadRequestException(NO_PROJECT);
    }

    const links = { repoUrl: dto.repoUrl, liveUrl: dto.liveUrl ?? null };
    const existing = await this.prisma.projectSubmission.findUnique({
      where: { userId_stageId: { userId, stageId: dto.stageId } },
    });

    if (existing) {
      if (existing.status === SubmissionStatus.APPROVED) {
        throw new ConflictException(
          'Your project is already approved and can no longer be changed.',
        );
      }
      const submission = await this.prisma.projectSubmission.update({
        where: { id: existing.id },
        data: { ...links, status: SubmissionStatus.PENDING },
        select: SUBMISSION_FIELDS,
      });
      return { message: 'Project updated and sent for a new review.', submission };
    }

    const submission = await this.prisma.projectSubmission.create({
      data: { userId, stageId: dto.stageId, ...links },
      select: SUBMISSION_FIELDS,
    });
    return { message: 'Project sent. The academy will review it.', submission };
  }

  // GET /project-submissions/mine: the projects of the courses the student
  // bought, newest purchase first: each course with its brief and the
  // student's submission (null: not sent yet). A course whose project was
  // removed stays when the student had sent it.
  async findMine(userId: string) {
    const items = await this.prisma.orderItem.findMany({
      where: { order: { userId, status: 'PAID' }, stageId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        stage: {
          select: {
            id: true,
            title: true,
            projectBrief: true,
            center: { select: { name: true } },
          },
        },
      },
    });
    const submissions = await this.prisma.projectSubmission.findMany({
      where: { userId },
      select: SUBMISSION_FIELDS,
    });

    const seen = new Set<string>();
    const projects: {
      course: { id: string; title: string; center: { name: string } };
      brief: string | null;
      submission: (typeof submissions)[number] | null;
    }[] = [];
    for (const item of items) {
      const stage = item.stage;
      if (stage === null || stage === undefined || seen.has(stage.id)) {
        continue;
      }
      seen.add(stage.id);
      const submission =
        submissions.find((sent) => sent.stageId === stage.id) ?? null;
      if (stage.projectBrief === null && submission === null) {
        continue;
      }
      projects.push({
        course: { id: stage.id, title: stage.title, center: stage.center },
        brief: stage.projectBrief,
        submission,
      });
    }
    return projects;
  }

  async getMySubmission(userId: string, stageId: string) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { userId_stageId: { userId, stageId } },
      include: { stage: { select: { title: true } } },
    });
    if (submission === null) {
      throw new NotFoundException('No submission found for this course.');
    }
    return submission;
  }

  // --- ACADEMY ADMINS (their academy) AND PLATFORM ADMINS (every academy) ---

  // GET /project-submissions/admin/pending: the projects to review, the
  // oldest first, so that nobody waits too long
  async findAllPending(actor: Actor) {
    const scope = await academyScope(this.prisma, actor);
    return this.prisma.projectSubmission.findMany({
      where: {
        status: SubmissionStatus.PENDING,
        ...(scope.all ? {} : { stage: { centerId: scope.centerId } }),
      },
      select: REVIEW_FIELDS,
      orderBy: { updatedAt: 'asc' },
    });
  }

  // GET /project-submissions/admin/reviewed: the last 100 reviews, the newest
  // first
  async findReviewed(actor: Actor) {
    const scope = await academyScope(this.prisma, actor);
    return this.prisma.projectSubmission.findMany({
      where: {
        status: { in: [SubmissionStatus.APPROVED, SubmissionStatus.NEEDS_WORK] },
        ...(scope.all ? {} : { stage: { centerId: scope.centerId } }),
      },
      select: REVIEW_FIELDS,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  // PATCH /project-submissions/:id/grade: approve, or ask for changes with
  // feedback. Academy admins only review their own academy's projects.
  async gradeSubmission(
    submissionId: string,
    dto: GradeSubmissionDto,
    actor: Actor,
  ) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { id: submissionId },
      include: { stage: { select: { centerId: true } } },
    });
    if (submission === null) {
      throw new NotFoundException('Submission not found.');
    }
    await assertManagesAcademy(this.prisma, actor, submission.stage.centerId);

    const feedback = dto.feedback ?? '';
    if (dto.status === 'NEEDS_WORK' && feedback === '') {
      throw new BadRequestException(FEEDBACK_NEEDED);
    }

    const reviewed = await this.prisma.projectSubmission.update({
      where: { id: submissionId },
      data: { status: dto.status, feedback: feedback === '' ? null : feedback },
      select: REVIEW_FIELDS,
    });
    return { message: 'Review saved.', submission: reviewed };
  }
}
