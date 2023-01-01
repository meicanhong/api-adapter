import {Inject, Injectable} from "@nestjs/common";
import * as Bluebird from 'bluebird'
import * as schedule from 'node-schedule';
import {AmqpConnection} from "@golevelup/nestjs-rabbitmq";


@Injectable()
export abstract class BaseAdapter {
  private prefix = `api_adapter.`
  private channelAlive = true
  public abstract queueName
  public preFetch = 2
  public nack = true
  public delayOnError = 1000
  private isConnection = true
  constructor(private readonly amqpConnection: AmqpConnection) {}

  /**
   * 注册消费器
   */
  async onModuleInit() {
    const that = this
    await this.consume({
      queueName: this.queueName,
      preFetch: this.preFetch || 1, // 同时消费的条数
      handle: async function (msg: {}) {
        await that.handle(msg)
      },
      options: { nack: this.nack, delayOnError: this.delayOnError}
    })
    await this.reconnection()
    console.log(this.queueName, 'onModuleInit success')
  }

  async sendToMq(queue: string, data: Record<string, any>): Promise<boolean> {
    let res = false
    try {
      // 发送消息共用一个 default channel
      const ch = this.amqpConnection.channel
      await ch.assertQueue(this.prefix + queue)
      res = ch.sendToQueue(this.prefix + queue, Buffer.from(JSON.stringify(data)))
      return res
    } catch (e) {
      console.error('send to mq error ', e)
      return false
    }
  }

  async consume({
    queueName,
    preFetch,
    handle,
    options
  }: {
    queueName: string
    preFetch: number
    handle: (param: any) => any
    options?: { nack: boolean; delayOnError?: number }
  }) {
    const queue = `${this.prefix}${queueName}`
    const mq = this.amqpConnection
    const channel = await mq.connection.createChannel()
    await channel.assertQueue(queue)
    await channel.prefetch(preFetch || this.preFetch)
    await this.registerChannelEvent(queue, channel)
    this.channelAlive = true

    try {
      await channel.consume(queue, async (msg: any) => {
        try {
          const json = JSON.parse(msg!.content.toString())
          await handle(json)
          await channel.ack(msg)
        } catch (e) {
          console.error(`mq consume queue:${queue} error: ${e}`, e.message)
          try {
            if (options && options.nack) {
              await Bluebird.delay(options.delayOnError || 3000)
              await channel.nack(msg)
            } else {
              await channel.ack(msg)
            }
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
