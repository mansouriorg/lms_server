import { 
  Controller, 
  Post, 
  Get, 
  Patch, 
  Param, 
  Body, 
  UseGuards 
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking.dto'; 
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard'; 
import { Roles } from '../auth/decorators/roles.decorator'; 
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from 'src/generated/prisma/enums'; // Assuming standard Prisma generation

@Controller('bookings')
@UseGuards(JwtAuthGuard) // Requires a valid JWT token for all routes in this controller
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // --- STUDENT ROUTES ---

  @Post()
  create(
    @GetUser('id') userId: string, // Extracted directly from the JWT token
    @Body() createBookingDto: CreateBookingDto
  ) {
    return this.bookingsService.create(userId, createBookingDto);
  }

  @Get('my-bookings')
  getUserBookings(@GetUser('id') userId: string) {
    return this.bookingsService.getUserBookings(userId);
  }

  // --- INSTRUCTOR / ADMIN ROUTES ---

  @Get('instructor/my-sessions')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN) // CENTER_ADMIN acts as the Instructor role
  getInstructorBookings(@GetUser('id') instructorId: string) {
    return this.bookingsService.getInstructorBookings(instructorId);
  }

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN) // Restrict platform-wide view to super admins only
  findAllForAdmin() {
    return this.bookingsService.findAllForAdmin();
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  updateStatus(
    @Param('id') bookingId: string,
    @Body() dto: UpdateBookingStatusDto
  ) {
    // Passes the status and the optional meeting link to the service
    return this.bookingsService.updateStatus(bookingId, dto.status, dto.meetingLink);
  }
}