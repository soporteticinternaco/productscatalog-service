import { Injectable } from "@nestjs/common";
import { Client } from "@elastic/elasticsearch";
import { ProductSearchFilters } from "./search.types";
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
      node: process.env.ELASTICSEARCH_NODE || "http://192.168.4.112:9200",
      auth: {
        username: process.env.ELASTICSEARCH_USER || "productscatalog",
        password: process.env.ELASTICSEARCH_PASSWORD || "123456",
      },
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
    filters: ProductSearchFilters = { deleted: false }
  ): Promise<ProductSearchResponse> {
    const index = "productscatalog-products";

    const response_fields = [
      "ref",
      "ean",
      "supplier_id",
      "supplier_name",
      `description.${lang}`,
      "container_units",
      `container_type.${lang}`,
      "step",
      "main_picture_url",
      "main_picture_thumb_url",
      "level1",
      "level2",
      "level3",
      `short_description.${lang}`,
      `description.${lang}`,
      `description.${lang}`,
      `level1Name.${lang}`,
      `level2Name.${lang}`,
      `level3Name.${lang}`,
    ];

    const body =
      q && q.length > 0
        ? {
            _source: response_fields,
            query: {
              bool: {
                should: [
                  {
                    term: {
                      "ref.raw": {
                        value: q,
                        boost: 7,
                      },
                    },
                  },
                  {
                    term: {
                      "ean.raw": {
                        value: q,
                        boost: 7,
                      },
                    },
                  },
                  {
                    match: {
                      "supplier_name.autocomplete": {
                        query: q,
                        boost: 5,
                      },
                    },
                  },
                  {
                    match: {
                      [`description.${lang}`]: {
                        query: q,
                        boost: 5,
                      },
                    },
                  },
                  {
                    match: {
                      [`short_description.${lang}`]: {
                        query: q,
                        boost: 2,
                      },
                    },
                  },
                  {
                    multi_match: {
                      query: q,
                      fields: [
                        `level1Name.${lang}`,
                        `level2Name.${lang}`,
                        `level3Name.${lang}`,
                      ],
                      type: "phrase_prefix",
                      boost: 1,
                    },
                  },
                ],
                minimum_should_match: 1,
                filter: this._buildFilters(filters),
              },
            },
          }
        : {
            query: {
              bool: {
                filter: this._buildFilters(filters),
              },
            },
          };

    const from = (page - 1) * limit;

    const result = await this.client.search({
      index,
      from,
      size: limit,
      ...body,
    });

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
    if (!filters) return [];

    const filterClauses: any[] = [];

    if (filters.supplier_id) {
      filterClauses.push({ term: { supplier_id: filters.supplier_id } });
    }
    if (filters.ref) {
      filterClauses.push({ term: { "ref.raw": filters.ref } });
    }
    if (filters.ean) {
      filterClauses.push({ term: { "ean.raw": filters.ean } });
    }
    if (typeof filters.visibility === "number" && filters.visibility) {
      filterClauses.push({
        range: { supplier_visibility: { gte: filters.visibility } },
      });
    }
    if (filters.level1Id) {
      filterClauses.push({ term: { level1: filters.level1Id } });
    }
    if (filters.level2Id) {
      filterClauses.push({ term: { level2: filters.level2Id } });
    }
    if (filters.level3Id) {
      filterClauses.push({ term: { level3: filters.level3Id } });
    }

    return filterClauses;
  }

  private _flattenLangFields(
    source: Record<string, any>,
    lang: string
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
    supplierIds: string[],
    visibility: number,
    lang: string
  ): Promise<SupplierCategoriesTree[]> {
    const index = "productscatalog-products";

    const filters = [
              { term: { "tenant_id.keyword": tenantId } },
            ];

    if (supplierIds) {
      filters.push({ terms: { "supplier_id.keyword": supplierIds } });
    }

    if (visibility) {
      filters.push({ term: { supplier_visibility: visibility } });
    }

    const { aggregations } = await this.client.search({
      index,
      size: 0,
      body: {
        query: {
          bool: {
            filter: filters
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

    return this.buildSupplierTree(aggregations.suppliers.buckets || [], lang);
  }

  buildSupplierTree(
    suppliersCats: any,
    lang: string
  ): SupplierCategoriesTree[] {
    return suppliersCats
      .sort((s1, s2) =>
        s1.supplier_name.hits.hits[0]._source.supplier_name.localeCompare(
          s2.supplier_name.hits.hits[0]._source.supplier_name
        )
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
                          a.description.localeCompare(b.description)
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
