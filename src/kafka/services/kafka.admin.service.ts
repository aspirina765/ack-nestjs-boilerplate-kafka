import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Admin, ITopicConfig, Kafka, KafkaConfig } from 'kafkajs';
import { Logger } from '@nestjs/common/services/logger.service';
import { ConfigService } from '@nestjs/config';
import { KAFKA_TOPICS, KAFKA_TOPICS_REPLY } from '../constants/kafka.constant';
import { IKafkaAdminService } from 'src/kafka/interfaces/kafka.admin-service.interface';

@Injectable()
export class KafkaAdminService
    implements IKafkaAdminService, OnModuleInit, OnModuleDestroy
{
    private readonly kafka: Kafka;
    private readonly admin: Admin;
    private readonly topics: string[];
    private readonly topicsReply: string[];
    private readonly brokers: string[];
    private readonly clientId: string;
    private readonly kafkaOptions: KafkaConfig;
    private readonly defaultPartition: number;

    protected logger = new Logger(KafkaAdminService.name);

    constructor(private readonly configService: ConfigService) {
        this.clientId = this.configService.get<string>('kafka.admin.clientId');
        this.brokers = this.configService.get<string[]>('kafka.brokers');

        this.topics = KAFKA_TOPICS;
        this.topicsReply = KAFKA_TOPICS_REPLY;

        this.kafkaOptions = {
            clientId: this.clientId,
            brokers: this.brokers,
        };

        this.defaultPartition = this.configService.get<number>(
            'kafka.admin.defaultPartition'
        );

        this.logger.log(`Brokers ${this.brokers}`);
        this.kafka = new Kafka(this.kafkaOptions);

        this.admin = this.kafka.admin();
    }

    async onModuleInit(): Promise<void> {
        await this.connect();
    }

    async onModuleDestroy(): Promise<void> {
        await this.disconnect();
    }

    async connect(): Promise<void> {
        this.logger.log(`Connecting ${KafkaAdminService.name} Admin`);
        await this.admin.connect();
        this.logger.log(`${KafkaAdminService.name} Admin Connected`);
    }

    async disconnect(): Promise<void> {
        this.logger.log(`Disconnecting ${KafkaAdminService.name} Admin`);
        await this.admin.connect();
        this.logger.log(`${KafkaAdminService.name} Admin Disconnected`);
    }

    async getAllTopic(): Promise<string[]> {
        return this.admin.listTopics();
    }

    async getAllTopicUnique(): Promise<string[]> {
        return [...new Set(await this.getAllTopic())].filter(
            (val) => val !== '__consumer_offsets'
        );
    }

    async createTopics(): Promise<boolean> {
        this.logger.log(`Topics ${this.topics}`);
        this.logger.log(`Topics Reply ${this.topicsReply}`);

        const currentTopic: string[] = await this.getAllTopicUnique();
        const data: ITopicConfig[] = [];

        for (const topic of this.topics) {
            if (!currentTopic.includes(topic)) {
                data.push({
                    topic,
                    numPartitions: this.defaultPartition,
                    replicationFactor: this.brokers.length,
                });
            }
        }

        for (const replyTopic of this.topicsReply) {
            if (!currentTopic.includes(replyTopic)) {
                data.push({
                    topic: replyTopic,
                    numPartitions: this.defaultPartition,
                    replicationFactor: this.brokers.length,
                });
            }
        }

        if (data.length > 0) {
            await this.admin.createTopics({
                waitForLeaders: true,
                topics: data,
            });
        }

        this.logger.log(`${KafkaAdminService.name} Topic Created`);

        return true;
    }

    async deleteTopics(): Promise<boolean> {
        const currentTopic: string[] = await this.getAllTopicUnique();

        const data = [];

        for (const topic of this.topics) {
            if (currentTopic.includes(topic)) {
                data.push(topic);
            }
        }

        for (const replyTopic of this.topicsReply) {
            if (currentTopic.includes(replyTopic)) {
                data.push(replyTopic);
            }
        }

        if (data.length > 0) {
            await this.admin.deleteTopics({
                topics: data,
            });
        }

        this.logger.log(`${KafkaAdminService.name} Topic Deleted`);

        return true;
    }
}
