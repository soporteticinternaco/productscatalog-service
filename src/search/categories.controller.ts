import { Controller, Get, Post, Query, Body, Req, HttpCode, Param } from "@nestjs/common";
import { ApiQuery, ApiBody, ApiTags, ApiParam } from "@nestjs/swagger";
import { SearchService } from "./search.service";
import { GetCategoriesTreeResponse } from "../dto";
import { CategoriesTreeRequestDto } from "./dto/categories-tree-request.dto";
import { Request } from "express";

@ApiTags("Categories")
@Controller("tenants/:tenantId")
export class CategoriesController {
  constructor(private readonly searchService: SearchService) { }

  @Get("categories-tree")
  @ApiParam({ name: "tenantId", required: true, type: String })
  @ApiQuery({
    name: "lang",
    required: false,
    enum: ["ca", "en", "es", "fr", "gl", "pt"],
  })
  @ApiQuery({
    name: "type",
    type: String,
    required: false,
    description: "Product type",
    example: "own",
  })
  @ApiQuery({
    name: "supplierIds",
    type: String,
    required: false,
    description: "Comma separated supplier ids",
    example: "WBG,BEN",
  })
  @ApiQuery({
    name: "l1Id",
    type: String,
    required: false,
    description: "Level1 cat Id",
    example: "06",
  })
  @ApiQuery({
    name: "l2Id",
    type: String,
    required: false,
    description: "Level2 cat Id",
    example: "0604",
  })
  @ApiQuery({
    name: "l3Id",
    type: String,
    required: false,
    description: "Level3 cat Id",
    example: "060406",
  })
  @ApiQuery({
    name: "visibility",
    type: Number,
    required: false,
    description: "Client visibility",
    example: 0,
  })
  @ApiQuery({
    name: "deleted",
    type: Boolean,
    required: false,
    description: "Include deleted products. If not set, only non-deleted are returned.",
    example: false,
  })
  @HttpCode(200)
  async getCategoriesTree(
    @Req() req: Request,
    @Param("tenantId") tenantId: string,
    @Query("lang") lang?: string,
    @Query("type") type?: string,
    @Query("supplierIds") supplierIds?: string,
    @Query("l1Id") level1Id?: string,
    @Query("l2Id") level2Id?: string,
    @Query("l3Id") level3Id?: string,
    @Query("visibility") visibility: number = 0,
    @Query("deleted") deleted?: string,
  ): Promise<GetCategoriesTreeResponse> {
    return this.doGetCategoriesTree(tenantId, {
      lang,
      type,
      supplierIds,
      l1Id: level1Id,
      l2Id: level2Id,
      l3Id: level3Id,
      visibility,
      deleted,
    });
  }

  @Post("categories-tree")
  @ApiParam({ name: "tenantId", required: true, type: String })
  @ApiBody({ type: CategoriesTreeRequestDto })
  @HttpCode(200)
  async getCategoriesTreeByPost(
    @Req() req: Request,
    @Param("tenantId") tenantId: string,
    @Body() body: CategoriesTreeRequestDto,
  ): Promise<GetCategoriesTreeResponse> {
    return this.doGetCategoriesTree(tenantId, body);
  }

  private async doGetCategoriesTree(
    tenantId: string,
    params: {
      lang?: string;
      type?: string;
      supplierIds?: string;
      l1Id?: string;
      l2Id?: string;
      l3Id?: string;
      visibility?: number;
      deleted?: string | boolean;
    },
  ): Promise<GetCategoriesTreeResponse> {
    const visibility = Number(params.visibility) || 0;
    const trees = await this.searchService.getCategoriesTree(
      tenantId,
      visibility,
      params.lang || "es",
      params.type || "edp",
      params.supplierIds,
      params.deleted !== undefined ? String(params.deleted) === "true" : undefined,
      params.l1Id,
      params.l2Id,
      params.l3Id,
    );
    return { data: trees };
  }
}
