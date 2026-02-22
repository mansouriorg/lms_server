// src/bookings/bookings.controller.ts
import { 
  Controller, 
  Post, 
  Get, 
  Patch, // <-- Added for updating status
  Param, 
  Body, 
  UseGuards, 
  UseInterceptors, 
  UploadedFiles 
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking.dto'; // <-- Added
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard'; // <-- Added
import { Roles } from '../auth/decorators/roles.decorator'; // <-- Added
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from 'generated/prisma/enums'; // <-- Added from your generated Enums

@Controller('bookings')
@UseGuards(JwtAuthGuard) // Requires a valid JWT token for all routes
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(
    @GetUser('id') userId: string, // Extracted directly from the token!
    @Body() createBookingDto: CreateBookingDto
  ) {
    return this.bookingsService.create(userId, createBookingDto);
  }

  @Get('my-bookings')
  getUserBookings(@GetUser('id') userId: string) {
    return this.bookingsService.getUserBookings(userId);
  }

  // --- Document Upload Endpoint ---
  @Post(':id/documents')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'front', maxCount: 1 },
      { name: 'back', maxCount: 1 },
    ], {
      // Configure where and how to save the files locally
      storage: diskStorage({
        destination: './uploads', // Saves to the 'uploads' folder in your root directory
        filename: (req, file, callback) => {
          // Generate a random unique name for the file to prevent overwriting
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
    })
  )
  uploadDocuments(
    @GetUser('id') userId: string,
    @Param('id') bookingId: string,
    @UploadedFiles() files: { front?: Express.Multer.File[], back?: Express.Multer.File[] }
  ) {
    return this.bookingsService.uploadDocuments(userId, bookingId, files);
  }

  // --- NEW: ADMIN ONLY ROUTES ---

  @Get('admin/all')
  @UseGuards(RolesGuard) // 1. Trigger the roles check
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN) // 2. Restrict to admins
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
    return this.bookingsService.updateStatus(bookingId, dto.status);
  }
}