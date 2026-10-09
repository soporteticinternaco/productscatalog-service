import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from "class-validator";
import { Type } from "class-transformer";

export class CategoriesTreeRequestDto {
  @ApiPropertyOptional({
    enum: ["ca", "en", "es", "fr", "gl", "pt"],
    default: "es",
  })
  @IsOptional()
  @IsIn(["ca", "en", "es", "fr", "gl", "pt"])
  lang: string = "es";

  @ApiPropertyOptional({
    description: "Product type",
    example: "own",
    default: "edp",
  })
  @IsOptional()
  @IsString()
  type: string = "edp";

  @ApiPropertyOptional({
    description: "Comma separated supplier ids",
    example: "WBG,BEN",
  })
  @IsOptional()
  @IsString()
  supplierIds?: string;

  @ApiPropertyOptional({ description: "Comma separated Level1 cat ids", example: "06" })
  @IsOptional()
  @IsString()
  l1Id?: string;

  @ApiPropertyOptional({ description: "Comma separated Level2 cat ids", example: "0604" })
  @IsOptional()
  @IsString()
  l2Id?: string;

  @ApiPropertyOptional({ description: "Comma separated Level3 cat ids", example: "060406" })
  @IsOptional()
  @IsString()
  l3Id?: string;

  @ApiPropertyOptional({
    description: "Client visibility",
    example: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  visibility: number = 0;

  @ApiPropertyOptional({
    description:
      "Include deleted products. If not set, only non-deleted are returned.",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}
