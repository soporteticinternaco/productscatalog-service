import { Controller, Get, Query, Post, Body, Req, HttpCode } from '@nestjs/common';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { Request } from 'express';
import { GetCategoriesTreeRequest, GetCategoriesTreeResponse } from '../dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'lang', required: false, enum: ['ca','en','es','fr','gl','pt'] })
  @ApiQuery({ name: 'page', type: Number, required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Results per page', example: 10 })
  @ApiQuery({ name: 'supplier_id', type: String, required: false, description: 'Supplier Id', example: '' })
  @ApiQuery({ name: 'ref', type: String, required: false, description: 'Product ref', example: '462' })
  @ApiQuery({ name: 'ean', type: String, required: false, description: 'Product ean', example: '3253561801174' })
  @ApiQuery({ name: 'level1Id', type: String, required: false, description: 'Level1 cat Id', example: '06' })
  @ApiQuery({ name: 'level2Id', type: String, required: false, description: 'Level2 cat Id', example: '0604' })
  @ApiQuery({ name: 'level3Id', type: String, required: false, description: 'Level3 cat Id', example: '060406' })
  @ApiQuery({ name: 'visibility', type: Number, required: false, description: 'Client visibility', example: 0 })
  @ApiResponse({ status: 200, description: 'Array of products' })
  async search(
    @Req() req: Request, 
    @Query('q') q?: string, @Query('lang') lang?: string, 
    @Query('supplier_id') supplier_id?: string,
    @Query('ref') ref?: string,
    @Query('ean') ean?: string,
    @Query('level1Id') level1Id?: string,
    @Query('level2Id') level2Id?: string,
    @Query('level3Id') level3Id?: string,
    @Query('visibility') visibility: number = 0,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 12) {

    const response = await this.searchService.search(q || '', lang || 'es', page, limit, {
      supplier_id, ref, ean, level1Id, level2Id, level3Id, visibility
    });

    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
    const lastPage = Math.max(1, Math.ceil(response.navigation.total / limit));

    const buildUrl = (p: number) =>
      `${baseUrl}?query=${encodeURIComponent(q)}&lang=${encodeURIComponent(lang)}&page=${p}&limit=${limit}` 
      + (supplier_id?"&supplier_id=" + supplier_id:"")
      + (ref?"&ref=" + ref:"")
      + (ean?"&ean=" + ean:"")
      + (level1Id?"&level1Id=" + level1Id:"")
      + (level2Id?"&level2Id=" + level2Id:"")
      + (level3Id?"&level3Id=" + level3Id:"")
      + (visibility?"&visibility=" + visibility:"");


    response.navigation = {
      ...response.navigation,
        firstPage: buildUrl(1),
        lastPage: buildUrl(lastPage),
        previousPage: page > 1 ? buildUrl(page - 1) : null,
        nextPage: page < lastPage ? buildUrl(page + 1) : null
    }

    return response;
  }

  @Post('categories-tree')
  @HttpCode(200)
  async getCategoriesTree(
    @Body() body: GetCategoriesTreeRequest,
  ): Promise<GetCategoriesTreeResponse> {
    const { tenantId, supplierIds, lang } = body;

    const trees = await this.searchService.getCategoriesTree(tenantId, supplierIds, lang);
    return { data: trees };
  }
}

