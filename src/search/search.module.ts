import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ElasticService } from './elastic.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, ElasticService],
})
export class SearchModule {}