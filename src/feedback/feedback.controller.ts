import { Controller, Get, Post, Body, UseGuards, Request, Param, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { AuthGuard } from '../guards/auth.guard';

@Controller('feedback')
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly cloudinaryService: CloudinaryService,
  ) { }

  @Post()
  @UseGuards(AuthGuard)
  @UseInterceptors(FilesInterceptor('images'))
  async create(
    @Request() req,
    @Body() body: { content: string; sentiment: string },
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    if (!req.user) {
      throw new BadRequestException('User must be logged in');
    }
    const userId = req.user.id;
    const imageUrls: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const result = await this.cloudinaryService.uploadImage(file);
        if ('secure_url' in result) {
          imageUrls.push(result.secure_url);
        }
      }
    }

    return this.feedbackService.create(userId, body.content, imageUrls, body.sentiment || 'POSITIVE');
  }

  @Get()
  async findAll() {
    return this.feedbackService.findAll();
  }

  @Post(':id/react')
  async react(
    @Request() req,
    @Body() body: { action: 'LIKE' | 'DISLIKE' },
    @Param('id') id: string,
  ) {
    const userId = req.user?.id || 0; // Use 0 or handle in service for anonymous
    return this.feedbackService.react(userId, +id, body.action);
  }
}
