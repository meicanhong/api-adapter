import {Inject, Injectable, Logger} from "@nestjs/common";
import * as Bluebird from 'bluebird'
import * as schedule from 'node-schedule';
import {AmqpConnection} from "@golevelup/nestjs-rabbitmq";


@Injectable()
export abstract class BaseAdapter {
  // 队列名称
  protected abstract queueName
  // 日志
  protected abstract logger: Logger
  // 消费并发数
  protected concurrentCount = 1
  // 消费异常时重试次数
  protected retryMax = 10
  // delayOnError: 消费异常时等待时间，单位毫秒
  public delayOnError = 1000
  // 消费超出重试次数后，是否重新发送到队列, 等待再次消费
  protected resend = false

  // 判断 channel 是否存活
  private channelAlive = true

  constructor(private readonly amqpConnection: AmqpConnection) {}

  /**
   * 注册消费器
   */
  async onModuleInit() {
    const that = this
    await this.consume({
      handle: async function (msg: {}) {
        await that.handle(msg)
      },
    })
    await this.reconnection()
  }

  async sendToMq(queue: string, data: Record<string, any>) {
    try {
      const channel = this.amqpConnection.channel
      await channel.assertQueue(queue)
      await channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)))
    } catch (e) {
      this.logger.error(this.queueName + ' send message to mq error ' + e.message )
    }
  }

  async consume({
    handle,
  }: {
    handle: (param: any) => any
  }) {
    const mq = this.amqpConnection
    const channel = await mq.connection.createChannel()
    await channel.assertQueue(this.queueName)
    await channel.prefetch(this.concurrentCount)
    await this.registerChannelEvent(this.queueName, channel)
    this.channelAlive = true

    try {
      await channel.consume(this.queueName, async (msg: any) => {
        try {
          const json = JSON.parse(msg!.content.toString())
          await handle(json)
          await channel.ack(msg)
        } catch (e) {
          this.logger.error(this.queueName + ' consume message error ' + e.message, e.stack)
          try {

          } catch (e) {
            this.channelAlive = false
            console.error(`mq consume exception error:${queue} error: ${e}`, e)
          }
        }
      })
    } catch (e) {
      this.channelAlive = false
      console.error(`mq consume channel:${queue} error: ${e}`, e)
    }
  }

  private async handleRetryOnException() {

      }

  private async registerChannelEvent(queueName: any, channel: any) {
    const that = this
    channel.once('error', function () {
      console.error(queueName, 'channel trigger error')
      that.channelAlive = false
    })
    channel.once('close', function () {
      console.error(queueName, 'channel trigger close')
      that.channelAlive = false
    })
  }

  protected async handle(msg: {}): Promise<void> {
    await this.runOneTask(msg)
  }

  /**
   * 定时重连MQ队列
   * 因为程序运行时因为各种因素失去了MQ的连接，重连后他是不会主动去拉取队列中的信息进行消费的，所以需要进行此操作
   */
  async reconnection() {
    schedule.scheduleJob('0 */1 * * * *', async () => {
      if (!this.channelAlive) {
        console.error(this.queueName, 'channel close, reconnecting')
        await this.onModuleInit()
      }
    });
  }


  // @ts-ignore
  abstract async initTasks(args: {}): Promise<void>

  // @ts-ignore
  abstract async runOneTask(msg: {}): Promise<void>

  // @ts-ignore
  abstract async requestAPI(msg: {}): Promise<any>
}
