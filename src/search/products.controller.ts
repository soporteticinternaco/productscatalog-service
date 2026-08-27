import { Controller, Get, Post, Query, Body, Req, Param } from "@nestjs/common";
import { ApiQuery, ApiBody, ApiResponse, ApiTags, ApiParam } from "@nestjs/swagger";
import { SearchService } from "./search.service";
import { ProductSearchResponse } from "../dto";
import { SearchProductsRequestDto } from "./dto/search-products-request.dto";
import { Request } from "express";

@ApiTags("Products")
@Controller("tenants/:tenantId/search")
export class ProductsController {
  constructor(private readonly searchService: SearchService) {}

  @Get("products")
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
    description: "Comma separated Level1 cat Ids",
    example: "06",
  })
  @ApiQuery({
    name: "l2Id",
    type: String,
    required: false,
    description: "Comma separated Level2 cat Ids",
    example: "0604",
  })
  @ApiQuery({
    name: "l3Id",
    type: String,
    required: false,
    description: "Comma separated Level3 cat Ids",
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
  @ApiQuery({
    name: "type",
    type: String,
    required: false,
    description: "Product type",
    example: "own",
  })
  @ApiQuery({
    name: "grouping",
    type: Boolean,
    required: false,
    description: "Group products by grouping_code",
    example: false,
  })
  @ApiQuery({
    name: "rate",
    type: String,
    required: false,
    description: "Product rate ID",
    example: "R1",
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
    @Query("page") page: number = 0,
    @Query("size") size: number = 12,
    @Query("sortBy") sortBy?: string,
    @Query("type") type?: string,
    @Query("grouping") grouping: boolean = false,
    @Query("rate") rate?: string,
  ): Promise<ProductSearchResponse> {
    return this.doSearch(req, tenantId, {
      q,
      lang,
      supplierId,
      ref,
      ean,
      l1Id,
      l2Id,
      l3Id,
      id,
      visibility,
      page,
      size,
      sortBy,
      type,
      grouping,
      rate,
    });
  }

  @Post("products")
  @ApiParam({ name: "tenantId", required: true, type: String })
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
  @ApiBody({ type: SearchProductsRequestDto })
  @ApiResponse({ status: 200, description: "Array of products" })
  async searchByPost(
    @Req() req: Request,
    @Param("tenantId") tenantId: string,
    @Query("page") page: number = 0,
    @Query("size") size: number = 12,
    @Body() body: SearchProductsRequestDto,
  ): Promise<ProductSearchResponse> {
    return this.doSearch(req, tenantId, { ...body, page, size });
  }

  private async doSearch(
    req: Request,
    tenantId: string,
    params: {
      q?: string;
      lang: string;
      supplierId?: string;
      ref?: string;
      ean?: string;
      l1Id?: string;
      l2Id?: string;
      l3Id?: string;
      id?: string;
      visibility: number;
      page: number;
      size: number;
      sortBy?: string;
      type?: string;
      grouping: boolean;
      rate?: string;
    },
  ): Promise<ProductSearchResponse> {
    const {
      q,
      lang,
      supplierId,
      ref,
      ean,
      l1Id,
      l2Id,
      l3Id,
      id,
      sortBy,
      type,
      rate,
    } = params;
    const page = Number(params.page) || 0;
    const size = Number(params.size) || 20;
    const visibility = Number(params.visibility) || 0;
    const isGrouping = String(params.grouping) === "true";

    const result = await this.searchService.search(
      lang,
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
        id,
        visibility,
        type,
        grouping: isGrouping,
        rate,
      },
      q,
      sortBy,
    );

    const total = result.navigation?.total || 0;
    const count = result.navigation?.count || 0;
    const data = result.data || [];

    const lastPage =
      total > 0
        ? total % size === 0
          ? total / size
          : Math.floor(total / size) + 1
        : 0;

    const protocol = req.protocol;
    const host = req.get("host");
    const path = req.originalUrl.split("?").shift();
    const baseUrl = `${protocol}://${host}${path}`;

    const response: ProductSearchResponse = {
      navigation: {
        total,
        page,
        limit: size,
        count,
        firstPage: "",
        lastPage: "",
        previousPage: null,
        nextPage: null,
      },
      data,
    };

    const buildUrl = (p: number) =>
      `${baseUrl}?lang=${encodeURIComponent(lang)}&page=${p}&size=${size}` +
      (q ? `&q=${encodeURIComponent(q)}` : "") +
      (supplierId ? `&supplierId=${supplierId}` : "") +
      (ref ? `&ref=${ref}` : "") +
      (ean ? `&ean=${ean}` : "") +
      (l1Id ? `&l1Id=${l1Id}` : "") +
      (l2Id ? `&l2Id=${l2Id}` : "") +
      (l3Id ? `&l3Id=${l3Id}` : "") +
      (id ? `&id=${id}` : "") +
      (visibility ? `&visibility=${visibility}` : "") +
      (sortBy ? `&sortBy=${sortBy}` : "") +
      (type ? `&type=${type}` : "") +
      (isGrouping ? `&grouping=${isGrouping}` : "") +
      (rate ? `&rate=${rate}` : "");

    response.navigation = {
      ...response.navigation,
      firstPage: buildUrl(0),
      lastPage: buildUrl(Math.max(0, lastPage - 1)),
      previousPage: page > 0 ? buildUrl(page - 1) : null,
      nextPage: page < lastPage - 1 ? buildUrl(page + 1) : null,
    };

    return response;
  }

  @Get("categories")
  @ApiParam({ name: "tenantId", required: true, type: String })
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({
    name: "lang",
    required: false,
    enum: ["ca", "en", "es", "fr", "gl", "pt"],
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
    description: "Comma separated Level1 cat Ids",
    example: "06",
  })
  @ApiQuery({
    name: "l2Id",
    type: String,
    required: false,
    description: "Comma separated Level2 cat Ids",
    example: "0604",
  })
  @ApiQuery({
    name: "l3Id",
    type: String,
    required: false,
    description: "Comma separated Level3 cat Ids",
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
    name: "type",
    type: String,
    required: false,
    description: "Product type",
    example: "own",
  })
  @ApiQuery({
    name: "rate",
    type: String,
    required: false,
    description: "Product rate ID",
    example: "R1",
  })
  @ApiResponse({
    status: 200,
    description: "Array of grouped categories with count",
  })
  async searchCategories(
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
    @Query("type") type?: string,
    @Query("rate") rate?: string,
  ): Promise<{ data: any[] }> {
    visibility = Number(visibility) || 0;

    const data = await this.searchService.searchCategoriesCount(
      lang,
      {
        tenantId,
        supplierId,
        deleted: false,
        ref,
        ean,
        l1Id,
        l2Id,
        l3Id,
        id,
        visibility,
        type,
        rate,
      },
      q,
    );

    return { data };
  }
}
