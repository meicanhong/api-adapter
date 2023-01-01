## Description
本项目主要用于外部取数。
主要功能：
- 定时：定时调用外部接口
- 容错：调用外部接口时异常时，框架会稍后重试
- 性能：易于横向拓展服务

## Installation
本项目基于 Nest 框架开发，仅依赖于 RabbitMQ 组件

安装 RabbitMQ
```bash
$ docker-compose up -d
```

安装项目依赖
```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Quickly Start
项目提供了一个 Demo：src/adapter/demo.adapter.ts

1. 定义任务队列名称
```typescript
queueName = 'demo_queue'
```
2. 开发任务提交逻辑
```typescript
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
```
3. 开发外部取数逻辑
```typescript
async requestAPI(msg: {}): Promise<any> {
    const url = 'https://www.baidu.com/'
    const result = await request.get(url).timeout(5000)
    await Bluebird.delay(1000)
    if (Math.floor(Math.random() * 10) <= 2) {
        throw new Error('mock exception')
    }
    return result.body
}
```

举个实例：我需要知道每天的菜市场价格。
1. 设置队列名为：菜市场价格队列
2. 开发任务提交逻辑：我想知道猪肉、牛肉、羊肉、白菜、胡萝卜、洋葱的价格，我就分别把商品信息发送到MQ中
3. 开发外部取数逻辑：我从MQ中获取到信息，是猪肉。那我就去调用外部商品价格的API，传入猪肉，得到今天猪肉的价格，然后存入数据库中

以上便是一个简单的实例