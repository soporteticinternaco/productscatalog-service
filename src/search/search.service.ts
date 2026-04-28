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
import { ElasticService } from "./elastic.service";

@Injectable()
export class SearchService {
  private client: Client;

  constructor(private elasticService: ElasticService) {
    this.client = this.elasticService.client;
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
    const tenantId = filters.tenantId?.toLowerCase();

    const index = `productscatalog-${tenantId}-products`;

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
      "rates",
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

    const sortClause = this._buildSort(lang, sortBy, filters);

    if (sortClause) {
      body.sort = sortClause;
    }

    if (filters.grouping && (!filters.type || filters.type === "own")) {
      body.collapse = {
        field: "grouping_code",
        inner_hits: {
          name: "grouped_items",
          size: 30,
          sort: sortClause || [{ _score: "desc" }],
        },
      };
    }

    const isGrouping = filters.grouping && (!filters.type || filters.type === "own");

    if (isGrouping) {
      // Add cardinality aggregation to get the true count of unique collapsed groups.
      body.aggs = {
        ...body.aggs,
        total_groups: {
          cardinality: { field: "grouping_code" },
        },
      };
    }

    // When collapse is active, ES processes `from + size` raw docs then collapses.
    // To guarantee `limit` unique collapsed groups we over-fetch by a multiplier.
    const GROUPING_FETCH_MULTIPLIER = 5;
    const fetchSize = isGrouping ? limit * GROUPING_FETCH_MULTIPLIER : limit;
    const from = page * limit;



    const result = await this.client.search({
      index,
      from,
      size: fetchSize,
      ...body,
    });

    return {
      navigation: {
        total: isGrouping
          ? ((result as any).aggregations?.total_groups?.value ?? (
            result.hits.total instanceof Object
              ? result.hits.total.value
              : result.hits.total
          ))
          : (
            result.hits.total instanceof Object
              ? result.hits.total.value
              : result.hits.total
          ),
        page,
        limit,
        count: isGrouping
          ? Math.min(result.hits.hits.length, limit)
          : result.hits.hits.length,
      },
      data: (isGrouping ? result.hits.hits.slice(0, limit) : result.hits.hits).map((hit: any) => {
        const src = hit._source || {};
        const flattened = this._flattenLangFields(
          src,
          lang,
        ) as ProductSearchResult;

        const applyRatePrice = (item: any, rawSrc: any) => {
          if (filters.rate && (!filters.type || filters.type === "own")) {
            const rateData = rawSrc.rates?.find((r: any) => r.id === filters.rate);
            if (rateData) {
              item.net_price = rateData.price;
            }
          }
          delete item.rates;
          return item;
        };

        if (hit.inner_hits && hit.inner_hits.grouped_items) {
          flattened.grouped_items = hit.inner_hits.grouped_items.hits.hits
            .filter((innerHit: any) => innerHit._id !== hit._id)
            .map((innerHit: any) => {
              const innerFlattened = this._flattenLangFields(innerHit._source, lang) as any;
              return applyRatePrice(innerFlattened, innerHit._source);
            });
        }

        applyRatePrice(flattened, src);

        return flattened;
      }),
    };
  }

  private _buildFilters(filters?: ProductSearchFilters) {
    if (!filters) return [];

    const filterClauses: any[] = [{ term: { deleted: false } }];

    if (filters.id) {
      filterClauses.push({ terms: { "id.keyword": filters.id.split(",") } });
    }

    if (filters.tenantId) {
      filterClauses.push({
        term: { "tenant_id.keyword": filters.tenantId.toLowerCase() },
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
    if (filters.type) {
      filterClauses.push({ term: { type: filters.type } });
    }
    if (filters.rate && (!filters.type || filters.type === "own")) {
      filterClauses.push({
        nested: {
          path: "rates",
          query: {
            term: { "rates.id": filters.rate },
          },
        },
      });
    }

    return filterClauses;
  }

  private _buildSort(
    lang: string,
    sortBy?: string,
    filters: ProductSearchFilters = {},
  ): any[] | undefined {
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
    if (field === "price") {
      const rateId = filters.rate && (!filters.type || filters.type === "own") ? filters.rate : null;
      return [
        {
          _script: {
            type: "number",
            script: {
              lang: "painless",
              params: { rateId },
              source: `
                if (doc['type'].size() == 0) return 0;
                if (doc['type'].value == 'edp') {
                  return doc['net_price_with_margin'].size() > 0 ? doc['net_price_with_margin'].value : 0;
                } else {
                  if (params.rateId != null && params.rateId != "") {
                    if (params._source.rates != null) {
                      for (rate in params._source.rates) {
                        if (rate.id == params.rateId) {
                          return rate.price;
                        }
                      }
                    }
                  }
                  return doc['net_price'].size() > 0 ? doc['net_price'].value : 0;
                }
              `,
            },
            order: direction,
          },
        },
      ];
    }

    if (field === "_score") {
      direction = "desc";
    }

    return [{ [field]: { order: direction } }];
  }

  private _getSortField(sortBy: string, lang: string): string {
    switch (sortBy) {
      case "price":
        return "price";
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
    deleted?: boolean,
  ): Promise<SupplierCategoriesTree[]> {
    const index = `productscatalog-${tenantId.toLocaleLowerCase()}-products`;

    const filters: Array<Record<string, any>> = [
      { term: { "tenant_id.keyword": tenantId.toLowerCase() } },
    ];

    if (supplierIds) {
      filters.push({ terms: { supplier_id: supplierIds } });
    }

    if (visibility) {
      filters.push({ range: { supplier_visibility: { gte: visibility } } });
    }

    if (deleted !== undefined) {
      filters.push({ term: { deleted } });
    } else {
      filters.push({ term: { deleted: false } });
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
                    const l2Name = l2.level2Name.hits.hits[0]?._source.level2Name[lang] ||
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
