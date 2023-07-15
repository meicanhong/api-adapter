import {BaseAdapter} from "./base.adapter";
import { Cron } from '@nestjs/schedule'
import * as lodash from 'lodash'
import * as request from 'superagent'
import * as Bluebird from 'bluebird'
import {Logger} from "@nestjs/common";


export class DemoAdapter extends BaseAdapter {
    queueName = 'demo_queue'
    logger = new Logger('demo')

    async onModuleInit(): Promise<void> {
        super.onModuleInit();
        await this.initTasks({})
    }

    @Cron('*/5 * * * * *')
    async initTasks(args: {}): Promise<void> {
        const datas = lodash.range(100).map(() => Date.now())
        await Bluebird.map(datas, async (data) => {
            await this.sendToMq({data})
        }, {concurrency: 1})
    }

    async runOneTask(msg: {}): Promise<void> {
        const data = lodash.get(msg, 'data')
        const result = await this.requestAPI(data)
        this.logger.debug(`${data} result: ${result}`)
    }

    async requestAPI(msg: {}): Promise<any> {
        // 随机抛异常
        if (lodash.random(0, 10) > 8) {
            throw new Error('request api error')
        }
        // const result = await request.get('http://localhost:3000/hello')
        return 'hello'
    }

}