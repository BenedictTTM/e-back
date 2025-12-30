import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) { }

  async create(userId: number, content: string, images: string[], sentiment: string) {
    return this.prisma.feedback.create({
      data: {
        userId,
        content,
        images,
        sentiment,
      } as any,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePic: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.feedback.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePic: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async react(userId: number, feedbackId: number, action: 'LIKE' | 'DISLIKE') {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id: feedbackId },
    });

    if (!feedback) {
      throw new Error('Feedback not found');
    }

    let likedBy = feedback.likedBy;
    let dislikedBy = feedback.dislikedBy;

    if (action === 'LIKE') {
      // Remove from dislikedBy if present
      dislikedBy = dislikedBy.filter((id) => id !== userId);
      // Toggle like
      if (likedBy.includes(userId)) {
        likedBy = likedBy.filter((id) => id !== userId);
      } else {
        likedBy.push(userId);
      }
    } else {
      // Remove from likedBy if present
      likedBy = likedBy.filter((id) => id !== userId);
      // Toggle dislike
      if (dislikedBy.includes(userId)) {
        dislikedBy = dislikedBy.filter((id) => id !== userId);
      } else {
        dislikedBy.push(userId);
      }
    }

    return this.prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        likedBy,
        dislikedBy,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profilePic: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }
}
