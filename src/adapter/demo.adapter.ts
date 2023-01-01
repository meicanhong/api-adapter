import {BaseAdapter} from "./base.adapter";
import { Cron } from '@nestjs/schedule'
import * as lodash from 'lodash'
import * as request from 'superagent'
import * as Bluebird from 'bluebird'

export class DemoAdapter extends BaseAdapter {
    queueName = 'demo_queue'

    // run every minute
    @Cron('0 * * * * *')
    async initTasks(args: {}): Promise<void> {
        const tasks = []
        for (let i = 0; i < 30; i++) {
            const message = {
                'data': i
            }
            tasks.push(this.sendToMq(this.queueName, message))
        }
        await Promise.all(tasks)
        console.log('send message success')
    }

    async requestAPI(msg: {}): Promise<any> {
        const url = 'https://www.baidu.com/'
        const result = await request.get(url).timeout(5000)
        await Bluebird.delay(1000)
        if (Math.floor(Math.random() * 10) <= 2) {
            throw new Error('mock exception')
        }
        return result.body
    }

    async runOneTask(msg: {}): Promise<void> {
        const data = lodash.get(msg, 'data')
        const result = await this.requestAPI(data)
        console.log('execute message success', data, result)
    }

}