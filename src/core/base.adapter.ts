import {Inject, Injectable, Logger} from "@nestjs/common";
import * as Bluebird from 'bluebird'
import {AmqpConnection, RabbitMQModule} from "@golevelup/nestjs-rabbitmq";


@Injectable()
export abstract class BaseAdapter {
  // 队列名称
  protected abstract queueName
  // 日志
  protected abstract logger: Logger
  // 消费并发数
  protected concurrentCount = 1
  // 消费异常时重试次数
  protected retryMax = 3
  // delayOnError: 消费异常时等待时间，单位毫秒
  public delayOnError = 1000
  // 消费超出重试次数后，是否重新发送到队列, 等待再次消费
  protected resend = false
  // mq channel
  private channel
  // 判断 channel 是否存活
  private channelAlive = true

  constructor(
      private readonly connection: AmqpConnection
  ) {}

  /**
   * 初始化任务
   * @param args
   */
  abstract initTasks(args: {}): Promise<void>

  /**
   * 执行任务
   * @param msg
   */
  abstract runOneTask(msg: {}): Promise<void>

  /**
   * 请求API
   * @param msg
   */
  abstract requestAPI(msg: {}): Promise<any>

  /**
   * 注册消费器
   */
  async onModuleInit() {
    const that = this
    await this.channelConnect()
    await this.consume({
      handle: async function (msg: {}) {
        await that.handle(msg)
      },
    })
    this.logger.debug(`${this.queueName} consumer init success, channel alive: ${this.channelAlive}`)
  }

  /**
   * 连接 channel
   */
  async channelConnect() {
    this.logger.debug( `${this.queueName} channel disconnect, reconnecting...`)
    const channel = await this.connection.connection.createChannel()
    await channel.assertQueue(this.queueName)
    await channel.prefetch(this.concurrentCount)
    await this.registerChannelEvent(channel)

    this.channel = channel
    this.channelAlive = true
  }

  /**
   * 注册 channel 事件
   * @param channel
   * @private
   */
  private async registerChannelEvent(channel: any) {
    const that = this
    channel.once('error', function () {
      that.logger.error(`${that.queueName} channel error`)
      that.channelAlive = false
    })
    channel.once('close', function () {
      that.logger.error(`${that.queueName} channel close`)
      that.channelAlive = false
    })
  }

  /**
   * 发送消息到 mq
   * @param queue
   * @param data
   */
  async sendToMq(data: Record<string, any>) {
    try {
      const channel = this.channel
      await channel.sendToQueue(this.queueName, Buffer.from(JSON.stringify(data)))
    } catch (e) {
      this.logger.error(`${this.queueName} send message to mq error ${e.message}`, e.stack)
    }
  }

  /**
   * 消费消息
   * @param handle
   */
  async consume({
    handle,
  }: {
    handle: (param: any) => any
  }) {
    try {
      await this.channel.consume(this.queueName, async (msg: any) => {
        let retryCount = 0
        while (retryCount < this.retryMax) {
          try {
            retryCount = retryCount + 1
            const json = JSON.parse(msg!.content.toString())
            await handle(json)
            await this.channel.ack(msg)
            break
          } catch (e) {
            await this.handleConsumerError(msg, retryCount, this.channel, e)
          }
        }
      })
    } catch (e) {
      this.channelAlive = false
      this.logger.error(`${this.queueName} consume channel error: ${e.message}`)
    }
  }

  /**
   * 处理消费异常
   * @param msg
   * @param retryCount
   * @param channel
   * @param e
   * @private
   */
  private async handleConsumerError(msg: any, retryCount: number, channel: any, e: any) {
    try {
      await Bluebird.delay(this.delayOnError)
      this.logger.error(`[${retryCount}/${this.retryMax}]  ${this.queueName} consume message error: ${e.message}`)

      // 判断 channel 是否存活
      if (!this.channelAlive) {
        await this.channelConnect()
      }

      // 重试次数超过最大值
      if (retryCount >= this.retryMax) {
        if (this.resend) {
          await this.sendToMq(msg)
        }
        await channel.ack(msg)
      }
    } catch (e) {
      this.channelAlive = false
      this.logger.error( `${this.queueName} handleConsumerError error: ${e.message}`)
    }
  }

  protected async handle(msg: {}): Promise<void> {
    await this.runOneTask(msg)
  }

}
