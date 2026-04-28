import { Controller, Get, Query, Req, HttpCode, Param } from "@nestjs/common";
import { ApiQuery, ApiResponse, ApiTags, ApiParam } from "@nestjs/swagger";
import { SearchService } from "./search.service";
import { GetCategoriesTreeResponse, ProductSearchResponse } from "../dto";
import { Request } from "express";

@ApiTags("Search")
@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) { }

  @Get(":tenantId")
  @ApiParam({ name: "tenantId", required: true, type: String })
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({
    name: "lang",
    required: false,
    enum: ["ca", "en", "es", "fr", "gl", "pt"],
  })
  @ApiQuery({
    name: "page",
    type: Number,
    required: false,
    description: "Page number",
    example: 1,
  })
  @ApiQuery({
    name: "size",
    type: Number,
    required: false,
    description: "Results per page",
    example: 10,
  })
  @ApiQuery({
    name: "supplierId",
    type: String,
    required: false,
    description: "Supplier Id",
    example: "",
  })
  @ApiQuery({
    name: "ref",
    type: String,
    required: false,
    description: "Comma separated  product refs",
    example: "462",
  })
  @ApiQuery({
    name: "ean",
    type: String,
    required: false,
    description: "Comma separated product eans",
    example: "3253561801174",
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
    name: "id",
    type: String,
    required: false,
    description: "Comma separated product ids",
    example: '"060406","AS234"',
  })
  @ApiQuery({
    name: "visibility",
    type: Number,
    required: false,
    description: "Client visibility",
    example: 0,
  })
  @ApiQuery({
    name: "sortBy",
    type: String,
    required: false,
    description: "Sort by field",
    example: "price+",
  })
  @ApiResponse({ status: 200, description: "Array of products" })
  async search(
    @Req() req: Request,
    @Param("tenantId") tenantId: string,
    @Query("q") q?: string,
    @Query("lang") lang: string = "es",
    @Query("supplierId") supplierId?: string,
    @Query("ref") ref?: string,
    @Query("ean") ean?: string,
    @Query("l1Id") l1Id?: string,
    @Query("l2Id") l2Id?: string,
    @Query("l3Id") l3Id?: string,
    @Query("id") id?: string,
    @Query("visibility") visibility: number = 0,
    @Query("page") page: number = 1,
    @Query("size") size: number = 12,
    @Query("sortBy") sortBy?: string,
  ): Promise<ProductSearchResponse> {
    if (!page) {
      page = 0;
    }

    if (!size) {
      size = 1000;
    }

    if (lang) {
      lang = lang.toLowerCase();
    }

    console.log("=====> ", "(" + sortBy + ")");

    const response = await this.searchService.search(
      q || "",
      lang || "es",
      page,
      size,
      {
        tenantId,
        supplierId,
        ref,
        ean,
        l1Id,
        l2Id,
        l3Id,
        visibility,
        id,
      },
      sortBy,
    );

    const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}${req.path}`;
    const lastPage = response?.navigation?.total
      ? Math.max(1, Math.ceil(response?.navigation?.total / size))
      : 0;

    const buildUrl = (p: number) =>
      `${baseUrl}?lang=${encodeURIComponent(lang)}&page=${p}&size=${size}` +
      (q ? `query=${encodeURIComponent(q)}` : "") +
      (supplierId ? `&supplierId=${supplierId}` : "") +
      (ref ? `&ref=${ref}` : "") +
      (ean ? `&ean=${ean}` : "") +
      (l1Id ? `&l1Id=${l1Id}` : "") +
      (l2Id ? `&l2Id=${l2Id}` : "") +
      (l3Id ? `&l3Id=${l3Id}` : "") +
      (id ? `&id=${id}` : "") +
      (visibility ? `&visibility=${visibility}` : "") +
      (sortBy ? `&sortBy=${sortBy}` : "");

    response.navigation = {
      ...response.navigation,
      firstPage: buildUrl(1),
      lastPage: buildUrl(lastPage),
      previousPage: page > 1 ? buildUrl(page - 1) : null,
      nextPage: page < lastPage ? buildUrl(page + 1) : null,
    };

    return response;
  }

  @Get(":tenantId/categories-tree")
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
  ): Promise<GetCategoriesTreeResponse> {
    const trees = await this.searchService.getCategoriesTree(
      tenantId,
      visibility || 0,
      lang || "es",
      supplierIds,
    );
    return { data: trees };
  }
}
