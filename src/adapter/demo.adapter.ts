import {BaseAdapter} from "../core/base.adapter";
import { Cron } from '@nestjs/schedule'
import * as lodash from 'lodash'
import * as request from 'superagent'
import * as Bluebird from 'bluebird'
import {Logger} from "@nestjs/common";


export class DemoAdapter extends BaseAdapter {
    // 定义队列名称，也就是任务名称
    queueName = 'demo_queue'
    // 定义日志，context 为当前类名
    logger = new Logger('DemoAdapter')


    /**
     * 初始化任务，将每个任务发送到 MQ
     * 尽量将每个任务的粒度拆细
     * @param args
     */
    @Cron('* * * * * *')
    async initTasks(args: {}): Promise<void> {
        const datas = lodash.range(10).map(() => Date.now())
        await Bluebird.map(datas, async (data) => {
            await this.sendToMq({data})
        }, {concurrency: 1})
    }

    /**
     * 消费任务，从 MQ 拉取任务并执行
     * 大致流程是：从 MQ 拉取任务 -> 解析任务 -> 请求 API -> 处理 API 响应结果
     * @param msg
     */
    async runOneTask(msg: {}): Promise<void> {
        const data = lodash.get(msg, 'data')
        const result = await this.requestAPI(data)
        this.logger.debug(`Fetch api result: [${result}]`)
    }

    /**
     * 请求 API
     * @param msg
     */
    async requestAPI(msg: {}): Promise<any> {
        if (lodash.random(0, 10) > 8) {
            throw new Error('request api error')
        }
        const result = await request.get('http://localhost:3000/hello')
        return result.text
    }

}