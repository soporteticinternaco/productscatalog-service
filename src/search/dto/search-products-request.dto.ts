import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from "class-validator";
import { Type } from "class-transformer";

export class SearchProductsRequestDto {
  @ApiPropertyOptional({ description: "Search query" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    enum: ["ca", "en", "es", "fr", "gl", "pt"],
    default: "es",
  })
  @IsOptional()
  @IsIn(["ca", "en", "es", "fr", "gl", "pt"])
  lang: string = "es";

  @ApiPropertyOptional({ description: "Supplier Id", example: "" })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({
    description: "Comma separated product refs",
    example: "462",
  })
  @IsOptional()
  @IsString()
  ref?: string;

  @ApiPropertyOptional({
    description: "Comma separated product eans",
    example: "3253561801174",
  })
  @IsOptional()
  @IsString()
  ean?: string;

  @ApiPropertyOptional({
    description: "Comma separated Level1 cat Ids",
    example: "06",
  })
  @IsOptional()
  @IsString()
  l1Id?: string;

  @ApiPropertyOptional({
    description: "Comma separated Level2 cat Ids",
    example: "0604",
  })
  @IsOptional()
  @IsString()
  l2Id?: string;

  @ApiPropertyOptional({
    description: "Comma separated Level3 cat Ids",
    example: "060406",
  })
  @IsOptional()
  @IsString()
  l3Id?: string;

  @ApiPropertyOptional({
    description: "Comma separated product ids",
    example: '"060406","AS234"',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description: "Client visibility",
    example: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  visibility: number = 0;

  @ApiPropertyOptional({ description: "Sort by field", example: "price+" })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: "Product type", example: "own" })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: "Group products by grouping_code",
    example: false,
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  grouping: boolean = false;

  @ApiPropertyOptional({ description: "Product rate ID", example: "R1" })
  @IsOptional()
  @IsString()
  rate?: string;
}
