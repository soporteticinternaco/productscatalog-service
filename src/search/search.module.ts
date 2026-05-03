import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';
import { SearchService } from './search.service';
import { ElasticService } from './elastic.service';

@Module({
  controllers: [ProductsController, CategoriesController],
  providers: [SearchService, ElasticService],
})
export class SearchModule {}