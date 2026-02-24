import { 
  Injectable, 
  NotFoundException, 
  ConflictException, 
  ForbiddenException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { SubmissionStatus } from 'src/generated/prisma/enums';

@Injectable()
export class ProjectSubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- STUDENT METHODS ---

  async submitProject(userId: string, dto: CreateSubmissionDto) {
    // 1. Verify the user actually bought this course
    // We now check OrderItems instead of Bookings!
    const enrollment = await this.prisma.orderItem.findFirst({
      where: {
        stageId: dto.stageId,
        order: {
          userId: userId,
          status: 'PAID', // Ensures the payment actually went through
        },
      },
    });

    if (!enrollment) {
      throw new ForbiddenException("Vous n'avez pas acheté ce cours.");
    }

    // 2. Check if a submission already exists
    const existingSubmission = await this.prisma.projectSubmission.findUnique({
      where: {
        userId_stageId: { userId: userId, stageId: dto.stageId },
      },
    });

    if (existingSubmission) {
      // If it is already approved, lock it down
      if (existingSubmission.status === SubmissionStatus.APPROVED) {
        throw new ConflictException('Votre projet a déjà été approuvé. Vous ne pouvez plus le modifier.');
      }
      
      // If it needs work, allow them to update their links and reset the status to PENDING
      const updatedSubmission = await this.prisma.projectSubmission.update({
        where: { id: existingSubmission.id },
        data: {
          repoUrl: dto.repoUrl,
          liveUrl: dto.liveUrl,
          status: SubmissionStatus.PENDING, 
        },
      });

      return { message: 'Projet mis à jour et soumis pour réévaluation.', submission: updatedSubmission };
    }

    // 3. Create a brand new submission
    const newSubmission = await this.prisma.projectSubmission.create({
      data: {
        userId: userId,
        stageId: dto.stageId,
        repoUrl: dto.repoUrl,
        liveUrl: dto.liveUrl,
      },
    });

    return { message: 'Projet soumis avec succès.', submission: newSubmission };
  }

  async getMySubmission(userId: string, stageId: string) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { 
        userId_stageId: { userId: userId, stageId: stageId } 
      },
      include: {
        stage: { select: { title: true } }
      }
    });

    if (!submission) {
      throw new NotFoundException("Aucune soumission trouvée pour ce cours.");
    }

    return submission;
  }

  // --- ADMIN / INSTRUCTOR METHODS ---

  async findAllPending() {
    return this.prisma.projectSubmission.findMany({
      where: { status: SubmissionStatus.PENDING },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        stage: { select: { title: true } },
      },
      orderBy: { createdAt: 'asc' }, // Oldest first to help instructors clear the queue fairly
    });
  }

  async gradeSubmission(submissionId: string, dto: GradeSubmissionDto) {
    const submission = await this.prisma.projectSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Soumission introuvable.');
    }

    const gradedSubmission = await this.prisma.projectSubmission.update({
      where: { id: submissionId },
      data: {
        status: dto.status,
        feedback: dto.feedback,
      },
      include: {
        user: { select: { email: true, firstName: true } } // Useful if you want to trigger an email notification next!
      }
    });

    return { message: 'Évaluation enregistrée avec succès.', submission: gradedSubmission };
  }
}