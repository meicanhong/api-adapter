import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {RabbitMQModule} from "@golevelup/nestjs-rabbitmq";
import {DemoAdapter} from "./adapter/demo.adapter";
import {ScheduleModule} from "@nestjs/schedule";

const imports = [
    ScheduleModule.forRoot(),
    RabbitMQModule.forRoot(RabbitMQModule, {
        uri: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
        connectionInitOptions: { wait: true, reject: true, timeout: 3000 }
    }),
]

const providers = [
    DemoAdapter,
    AppService,
]

@Module({
  imports: imports,
  providers: providers,
  controllers: [AppController],
})
export class AppModule {}
