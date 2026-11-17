import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ReelsModule } from './modules/reels/reels.module';
import { FollowsModule } from './modules/follows/follows.module';
import { ActivityLogModule } from './modules/activity-logs/activity-log.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { PropertyTypesModule } from './modules/property-types/property-types.module';
import { LocationModule } from './modules/location/location.module';
import { FavoriteProfilesModule } from './modules/favorite-profiles/favorite-profiles.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { HTTPLoggerMiddleware } from './modules/common/middleware/logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username:
          configService.get<string>('DB_USERNAME') ||
          configService.get<string>('DB_USER', 'root'),
        password: configService.get<string>('DB_PASSWORD', 'root_password'),
        database:
          configService.get<string>('DB_DATABASE') ||
          configService.get<string>('DB_NAME', 'reelsgate_roxx_db'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize:
          configService.get<string>('DB_SYNCHRONIZE') === 'true' ||
          configService.get<boolean>('DB_SYNCHRONIZE') === true,
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: Number(configService.get<number>('THROTTLE_TTL', 60000)),
            limit: Number(configService.get<number>('THROTTLE_LIMIT', 100)),
          },
        ],
        errorMessage: (_context, details) => {
          const minutes = Math.round(details.ttl / 60000);
          const timeDesc =
            minutes >= 60
              ? `${Math.round(minutes / 60)} hour(s)`
              : `${minutes} minute(s)`;
          return `Rate limit exceeded. Maximum ${details.limit} requests per ${timeDesc}. Please try again later.`;
        },
      }),
    }),
    AuthModule,
    UsersModule,
    ReelsModule,
    FollowsModule,
    ActivityLogModule,
    AnalyticsModule,
    MessagingModule,
    NotificationsModule,
    CategoriesModule,
    PropertyTypesModule,
    LocationModule,
    FavoriteProfilesModule,
    ReviewsModule,
    FeedbackModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HTTPLoggerMiddleware).forRoutes('*');
  }
}

