import { Injectable } from "@nestjs/common";
import { Client } from "@elastic/elasticsearch";

@Injectable()
export class ElasticService {
  private readonly _client: Client;

  constructor() {
    this._client = new Client({
      node: process.env.ELASTIC_SEARCH_URL,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  get client(): Client {
    return this._client;
  }
}
