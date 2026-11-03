import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { trimText } from '../../common/text';

// The two answers of a review (PENDING is the state while nobody reviewed)
export const REVIEW_STATUSES = ['APPROVED', 'NEEDS_WORK'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const FEEDBACK_MAX = 2000;

// PATCH /project-submissions/:id/grade: the academy's review. Asking for
// changes needs feedback (checked by the service).
export class GradeSubmissionDto {
  @IsIn(REVIEW_STATUSES, { message: 'Choose Approved or Needs work.' })
  status: ReviewStatus;

  @IsOptional()
  @Transform(trimText)
  @IsString({ message: 'The feedback must be text.' })
  @MaxLength(FEEDBACK_MAX, { message: `The feedback can have at most ${FEEDBACK_MAX} characters.` })
  feedback?: string;
}
