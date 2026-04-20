import { Injectable } from "@nestjs/common";
import { Client } from "@elastic/elasticsearch";
import {
  CategoriesTreeAggregation,
  ProductSearchFilters,
  SupplierCat,
} from "./search.types";
import {
  CategoryNode,
  ProductSearchResponse,
  ProductSearchResult,
  SupplierCategoriesTree,
} from "src/dto";

@Injectable()
export class SearchService {
  private client: Client;

  constructor() {
    this.client = new Client({
      node:
        process.env.ELASTIC_SEARCH_URL ||
        "http://productscatalog:123456@192.168.4.112:9200",
      // If using self-signed certs
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  /**
   * Search full document in selected language.
   * - Uses multi_match on language-specific fields when q provided.
   * - Returns full _source for each hit.
   */
  async search(
    q: string,
    lang: string,
    page: number = 1,
    limit: number = 10,
    filters: ProductSearchFilters = { deleted: false },
    sortBy?: string,
  ): Promise<ProductSearchResponse> {
    const index = "productscatalog-products";

    const response_fields = [
      "id",
      "ref",
      "ean",
      "supplier_id",
      "supplier_name",
      `description.${lang}`,
      `short_description.${lang}`,
      `description.${lang}`,
      `description.${lang}`,
      `level1Name.${lang}`,
      `level2Name.${lang}`,
      `level3Name.${lang}`,
      "discount1",
      "discount2",
      "net_price",
      "sale_price",
      "net_price_with_margin",
      "vat_amount",
    ];

    const body: Record<string, any> =
      q && q.length > 0
        ? {
            _source: response_fields,
            query: {
              bool: {
                should: [
                  {
                    multi_match: {
                      query: q,
                      type: "cross_fields",
                      fields: [
                        `description.${lang}`,
                        `short_description.${lang}`,
                        "supplier_name",
                        `level3Name.${lang}`,
                      ],
                      operator: "and",
                      boost: 25,
                    },
                  },
                  {
                    term: {
                      "ref.keyword": {
                        value: q,
                        boost: 20,
                      },
                    },
                  },
                  {
                    match: {
                      ref: {
                        query: q,
                        boost: 10,
                      },
                    },
                  },
                  {
                    term: {
                      "ean.keyword": {
                        value: q,
                        boost: 20,
                      },
                    },
                  },
                  {
                    match: {
                      ean: {
                        query: q,
                        boost: 10,
                      },
                    },
                  },
                  {
                    match: {
                      supplier_name: {
                        query: q,
                        boost: 20,
                        operator: "or",
                      },
                    },
                  },
                  {
                    match: {
                      supplier_name: {
                        query: q,
                        fuzziness: "AUTO",
                        boost: 8,
                        operator: "or",
                      },
                    },
                  },
                  {
                    match_phrase_prefix: {
                      [`description.${lang}`]: {
                        query: q,
                        boost: 40,
                      },
                    },
                  },
                  {
                    match: {
                      [`description.${lang}`]: {
                        query: q,
                        operator: "or",
                        minimum_should_match: 1,
                        boost: 15,
                      },
                    },
                  },
                  {
                    match: {
                      [`description.${lang}`]: {
                        query: q,
                        fuzziness: "AUTO",
                        boost: 4,
                      },
                    },
                  },
                  {
                    match: {
                      [`short_description.${lang}`]: {
                        query: q,
                        boost: 6,
                      },
                    },
                  },
                  {
                    match: {
                      [`short_description.${lang}`]: {
                        query: q,
                        fuzziness: "AUTO",
                        boost: 3,
                      },
                    },
                  },
                  {
                    multi_match: {
                      query: q,
                      fields: [`level3Name.${lang}`],
                      boost: 4,
                    },
                  },
                  {
                    multi_match: {
                      query: q,
                      fields: [`level3Name.${lang}`],
                      fuzziness: "AUTO",
                      boost: 2,
                    },
                  },
                  {
                    multi_match: {
                      query: q,
                      fields: [`level1Name.${lang}`, `level2Name.${lang}`],
                      boost: 3,
                    },
                  },
                  {
                    multi_match: {
                      query: q,
                      fields: [`level1Name.${lang}`, `level2Name.${lang}`],
                      fuzziness: "AUTO",
                      boost: 2,
                    },
                  },
                  {
                    multi_match: {
                      query: q,
                      fields: [
                        `description.${lang}.phonetic`,
                        `short_description.${lang}.phonetic`,
                        `level3Name.${lang}.phonetic`,
                      ],
                      boost: 4,
                    },
                  },
                  {
                    multi_match: {
                      query: q,
                      fields: [
                        `level1Name.${lang}.phonetic`,
                        `level2Name.${lang}.phonetic`,
                      ],
                      boost: 2,
                    },
                  },
                ],
                minimum_should_match: 1,
                filter: this._buildFilters(filters),
              },
            },
          }
        : {
            _source: response_fields,
            query: {
              bool: {
                filter: this._buildFilters(filters),
              },
            },
          };

    const sortClause = this._buildSort(lang, sortBy);

    if (sortClause) {
      body.sort = sortClause;
    }

    console.log("BODY: ", JSON.stringify(body, null, 2));

    const from = page * limit;

    const result = await this.client.search({
      index,
      from,
      size: limit,
      ...body,
    });

    //console.log("RESPONSE: ", JSON.stringify(result, null, 2));

    return {
      navigation: {
        total:
          result.hits.total instanceof Object
            ? result.hits.total.value
            : result.hits.total,
        page,
        limit,
      },
      data: result.hits.hits.map((hit) => {
        const src = hit._source || {};
        return this._flattenLangFields(src, lang) as ProductSearchResult;
      }),
    };
  }

  private _buildFilters(filters?: ProductSearchFilters) {
    //console.log("FILTERS: ", JSON.stringify(filters, null, 2));

    if (!filters) return [];

    const filterClauses: any[] = [{ term: { deleted: false } }];

    if (filters.id) {
      filterClauses.push({ terms: { "id.keyword": filters.id.split(",") } });
    }

    if (filters.tenantId) {
      filterClauses.push({
        term: { "tenant_id.keyword": filters.tenantId },
      });
    }

    if (filters.supplierId) {
      filterClauses.push({
        term: { "supplier_id.keyword": filters.supplierId },
      });
    }

    if (filters.ref) {
      filterClauses.push({ terms: { "ref.keyword": filters.ref.split(",") } });
    }
    if (filters.ean) {
      filterClauses.push({ terms: { "ean.keyword": filters.ean.split(",") } });
    }
    if (typeof filters.visibility === "number" && filters.visibility) {
      filterClauses.push({
        range: { supplier_visibility: { gte: filters.visibility } },
      });
    }
    if (filters.l1Id) {
      filterClauses.push({ term: { level1: filters.l1Id } });
    }
    if (filters.l2Id) {
      filterClauses.push({ term: { level2: filters.l2Id } });
    }
    if (filters.l3Id) {
      filterClauses.push({ term: { level3: filters.l3Id } });
    }

    return filterClauses;
  }

  private _buildSort(lang: string, sortBy?: string): any[] | undefined {
    let direction: "asc" | "desc" = "desc"; // default ascending

    if (!sortBy) {
      sortBy = "relevance-";
    }

    if (sortBy.endsWith("-")) {
      direction = "desc";
      sortBy = sortBy.slice(0, -1); // remove trailing '-'
    } else if (sortBy.endsWith("+") || sortBy.endsWith(" ")) {
      direction = "asc";
      sortBy = sortBy.slice(0, -1); // remove trailing '+'
    }

    const field = this._getSortField(sortBy, lang);

    if (field === "_score") {
      direction = "desc";
    }

    return [{ [field]: { order: direction } }];
  }

  private _getSortField(sortBy: string, lang: string): string {
    switch (sortBy) {
      case "price":
        return "net_price_with_margin";
      case "description":
        return `description.${lang}.keyword`;
      case "ref":
        return "ref.keyword";
      case "relevance":
      default:
        return "_score";
    }
  }

  private _flattenLangFields(
    source: Record<string, any>,
    lang: string,
  ): Record<string, any> {
    const flatten = (obj: any): any => {
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        // If this object has the language key, return only that value
        if (lang in obj) {
          return obj[lang];
        }
        // Otherwise, recurse into the object
        const result: Record<string, any> = {};
        for (const key in obj) {
          result[key] = flatten(obj[key]);
        }
        return result;
      }
      return obj;
    };

    return flatten(source);
  }

  async getCategoriesTree(
    tenantId: string,
    visibility: number,
    lang: string,
    supplierIds?: string[],
  ): Promise<SupplierCategoriesTree[]> {
    const index = "productscatalog-products";

    const filters: Array<Record<string, any>> = [
      { term: { "tenant_id.keyword": tenantId } },
    ];

    if (supplierIds) {
      filters.push({ terms: { supplier_id: supplierIds } });
    }

    if (visibility) {
      filters.push({ range: { supplier_visibility: { gte: visibility } } });
    }

    const { aggregations } = await this.client.search({
      index,
      size: 0,
      body: {
        query: {
          bool: {
            filter: filters,
          },
        },
        aggs: {
          suppliers: {
            terms: { field: "supplier_id.keyword", size: 1000 },
            aggs: {
              supplier_name: {
                top_hits: { _source: ["supplier_name"], size: 1 },
              },
              level1: {
                terms: { field: "level1.keyword", size: 1000 },
                aggs: {
                  level1Name: {
                    top_hits: { _source: [`level1Name.${lang}`], size: 1 },
                  },
                  level2: {
                    terms: { field: "level2.keyword", size: 1000 },
                    aggs: {
                      level2Name: {
                        top_hits: { _source: [`level2Name.${lang}`], size: 1 },
                      },
                      level3: {
                        terms: { field: "level3.keyword", size: 1000 },
                        aggs: {
                          level3Name: {
                            top_hits: {
                              _source: [`level3Name.${lang}`],
                              size: 1,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return this.buildSupplierTree(
      (aggregations as CategoriesTreeAggregation).suppliers.buckets || [],
      lang,
    );
  }

  buildSupplierTree(
    suppliersCats: SupplierCat[],
    lang: string,
  ): SupplierCategoriesTree[] {
    return suppliersCats
      .sort((s1, s2) =>
        s1.supplier_name.hits.hits[0]._source.supplier_name.localeCompare(
          s2.supplier_name.hits.hits[0]._source.supplier_name,
        ),
      )
      .map((s) => {
        return {
          supplierId: s.key,
          description: s.supplier_name.hits.hits[0]._source.supplier_name,
          categories: (s.level1.buckets || [])
            .map((l1) => {
              const l1Name =
                l1.level1Name.hits.hits[0]?._source.level1Name[lang] || "";
              return {
                id: l1.key,
                description: l1Name,
                children: (l1.level2.buckets || [])
                  .map((l2) => {
                    const l2Name =
                      l2.level2Name.hits.hits[0]?._source.level2Name[lang] ||
                      "";
                    return {
                      id: l2.key,
                      description: l2Name,
                      children: (l2.level3.buckets || [])
                        .map((l3) => {
                          const l3Name =
                            l3.level3Name.hits.hits[0]?._source.level3Name[
                              lang
                            ] || "";
                          return { id: l3.key, description: l3Name };
                        })
                        .sort((a, b) =>
                          a.description.localeCompare(b.description),
                        ),
                    };
                  })
                  .sort((a, b) => a.description.localeCompare(b.description)),
              };
            })
            .sort((a, b) => a.description.localeCompare(b.description)),
        };
      });
  }
}
