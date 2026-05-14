import { Controller, Get, Query, Req, HttpCode, Param } from "@nestjs/common";
import { ApiQuery, ApiTags, ApiParam } from "@nestjs/swagger";
import { SearchService } from "./search.service";
import { GetCategoriesTreeResponse } from "../dto";
import { Request } from "express";

@ApiTags("Search")
@Controller("tenants/:tenantId/categories")
export class CategoriesController {
  constructor(private readonly searchService: SearchService) { }

  @Get("tree")
  @ApiParam({ name: "tenantId", required: true, type: String })
  @ApiQuery({
    name: "lang",
    required: false,
    enum: ["ca", "en", "es", "fr", "gl", "pt"],
  })
  @ApiQuery({
    name: "supplierIds",
    type: String,
    required: false,
    description: "Supplier Ids",
    example: "",
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
    @Query("supplierIds") supplierIds?: string[],
    @Query("lId") level1Id?: string,
    @Query("l2Id") level2Id?: string,
    @Query("l3Id") level3Id?: string,
    @Query("visibility") visibility: number = 0,
    @Query("deleted") deleted?: string,
  ): Promise<GetCategoriesTreeResponse> {
    const trees = await this.searchService.getCategoriesTree(
      tenantId,
      visibility || 0,
      lang || "es",
      supplierIds,
      deleted !== undefined ? String(deleted) === "true" : undefined,
    );
    return { data: trees };
  }
}
