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

  /** Products index name for a tenant. Single source of truth for the index. */
  private _productsIndex(tenantId?: string): string {
    return `productscatalog-${String(tenantId).toLowerCase()}-products-v2`;
  }

  /**
   * Search full document in selected language.
   * - Uses multi_match on language-specific fields when q provided.
   * - Returns full _source for each hit.
   */
  async search(
    lang: string,
    page: number = 0,
    limit: number = 10,
    filters: ProductSearchFilters = { deleted: false },
    q?: string,
    sortBy?: string,
  ): Promise<ProductSearchResponse> {
    const tenantId = filters.tenantId?.toLowerCase();
    const index = this._productsIndex(tenantId);
    lang = lang.toLowerCase();

    const isFuzzy = !!q && q.length >= 3;

    const response_fields = [
      "id",
      "ref",
      "ean",
      "supplier_id",
      "supplier_name",
      `description.${lang}`,
      `short_description.${lang}`,
      "level1",
      `level1Name.${lang}`,
      "level2",
      `level2Name.${lang}`,
      "level3",
      `level3Name.${lang}`,
      "discount1",
      "discount2",
      "net_price",
      "sale_price",
      "net_price_with_margin",
      "vat_amount",
      "rates",
      "main_picture_url",
      "main_picture_thumb_url",
      "characteristics",
    ];

    if (filters?.type === "edp") {
      response_fields.push(
        "container_units",
        `container_type.${lang}`,
        "step",
        "main_picture_url",
        "main_picture_thumb_url",
      );
    }

    const query = this._buildSearchQuery(lang, q, filters);

    let body: Record<string, any> = {
      _source: response_fields,
      query,
    };

    const sortClause = this._buildSort(lang, sortBy, filters);
    if (sortClause) body.sort = sortClause;

    const isGrouping =
      filters.grouping && (!filters.type || filters.type === "own");

    if (isGrouping) {
      body.collapse = {
        field: "grouping_code",
        inner_hits: {
          name: "grouped_items",
          size: 10,
          sort: [{ _score: "desc" }],
        },
      };

      body.aggs = {
        total_groups: {
          cardinality: {
            field: "grouping_code",
            precision_threshold: 1000,
          },
        },
      };
    }

    const fetchSize = limit;
    const from = page * limit;

    const queryObject = {
      index,
      from,
      size: fetchSize,
      track_scores: true,
      track_total_hits: isGrouping ? false : 10000,
      explain: process.env.ES_EXPLAIN === "1",
      ...body,
    };

    const result = await this.client.search(queryObject);

    console.log("query body:", JSON.stringify(queryObject, null, 2));

    if (process.env.ES_EXPLAIN === "1") {
      (result.hits.hits as any[]).slice(0, 5).forEach((hit: any) => {
        console.log(
          `\n--- EXPLAIN: ${hit._source?.description?.[lang] ?? hit._id} (score: ${hit._score}) ---`,
        );
        console.log(JSON.stringify(hit._explanation, null, 2));
      });
    }

    const navigation = this._buildNavigation(result, page, limit, isGrouping);

    console.log("navigation", JSON.stringify(navigation, null, 2));

    return {
      navigation,
      data: (isGrouping
        ? result.hits.hits.slice(0, limit)
        : result.hits.hits
      ).map((hit: any) => {
        const src = hit._source || {};
        const flattened = this._flattenLangFields(
          src,
          lang,
        ) as ProductSearchResult;

        const applyRatePrice = (item: any, rawSrc: any) => {
          if (filters.rate && (!filters.type || filters.type === "own")) {
            const rateData = rawSrc.rates?.find(
              (r: any) => r.id === filters.rate,
            );
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
              const innerFlattened = this._flattenLangFields(
                innerHit._source,
                lang,
              ) as any;
              innerFlattened.characteristics = this._localizeCharacteristics(
                innerHit._source.characteristics,
                lang,
              );
              return applyRatePrice(innerFlattened, innerHit._source);
            });
        }

        applyRatePrice(flattened, src);
        flattened.characteristics = this._localizeCharacteristics(
          src.characteristics,
          lang,
        );

        return flattened;
      }),
    };
  }

  private _buildNavigation(
    result: any,
    page: number,
    limit: number,
    isGrouping: boolean | undefined,
  ) {
    const totalHits =
      result.hits.total instanceof Object
        ? result.hits.total.value
        : result.hits.total;

    return {
      total: isGrouping
        ? (result.aggregations?.total_groups?.value ?? totalHits)
        : totalHits,
      page,
      limit,
      count: isGrouping
        ? Math.min(result.hits.hits.length, limit)
        : result.hits.hits.length,
    };
  }

  private _buildSearchQuery(
    lang: string,
    q: string | undefined,
    filters: ProductSearchFilters,
  ) {
    const isFuzzy = !!q && q.length >= 3;
    const filtersClause = this._buildFilters(filters, lang);

    if (q && q.length > 0) {
      const mainQueries: any[] = [
        // 🔹 Exact boosts (cheap & important)
        { term: { "ref.keyword": { value: q, boost: 20 } } },
        { term: { "ean.keyword": { value: q, boost: 20 } } },

        // 🔹 Text relevance grouped per field using dis_max
        {
          dis_max: {
            tie_breaker: 0.1,
            queries: [
              {
                multi_match: {
                  query: q,
                  type: "cross_fields",
                  fields: [
                    `description.${lang}`,
                    `description.${lang}.normalized`,
                    `description.${lang}.stemmed`,
                    `description.${lang}.iberian`,
                    `short_description.${lang}`,
                    "supplier_name",
                    "supplier_name.normalized",
                    `level3Name.${lang}`,
                    `tags.${lang}`,
                  ],
                  operator: "and",
                  boost: 25,
                } as any,
              },
              {
                match_phrase: {
                  [`description.${lang}`]: {
                    query: q,
                    boost: 50,
                  },
                },
              },
              {
                match_phrase: {
                  [`description.${lang}.iberian`]: {
                    query: q,
                    boost: 50,
                  },
                },
              },
              {
                match_phrase_prefix: {
                  [`description.${lang}`]: {
                    query: q,
                    boost: 40,
                    max_expansions: 10,
                  },
                },
              },
              {
                match: {
                  [`description.${lang}`]: {
                    query: q,
                    boost: 15,
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
                  [`tags.${lang}`]: {
                    query: q,
                    boost: 8,
                  },
                },
              },
              {
                match: {
                  supplier_name: {
                    query: q,
                    boost: 20,
                    fuzziness: "AUTO",
                  },
                },
              },
              {
                match: {
                  "supplier_name.normalized": {
                    query: q,
                    boost: 15,
                  },
                },
              },
            ],
          },
        },

        // 🔹 Category fields
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
            fields: [`level1Name.${lang}`, `level2Name.${lang}`],
            boost: 3,
          },
        },

        // 🔹 Phonetic (recall helper)
        {
          multi_match: {
            query: q,
            fields: [
              `description.${lang}.phonetic`,
              `short_description.${lang}.phonetic`,
              `level3Name.${lang}.phonetic`,
              `supplier_name.phonetic`,
              `tags.${lang}.phonetic`,
            ],
            boost: 4,
          },
        },
      ];

      // Minimal fuzziness for recall (ONLY ONE CLAUSE).
      // fuzziness: "AUTO:3,100" — 0 edits for tokens < 3 chars, 1 edit for
      // tokens of 3–99 chars. This prevents short numeric tokens (e.g. "38")
      // from fuzzy-matching unrelated numbers ("30", edit distance 1) while
      // still handling single-char typos in real words ("taldro"→"taladro").
      if (isFuzzy) {
        mainQueries.push({
          match: {
            [`description.${lang}`]: {
              query: q,
              fuzziness: "AUTO:3,5",
              boost: 10,
            },
          },
        });
      }

      // When the query has short tokens (< 3 chars, e.g. "38", "cm") alongside
      // longer ones, a plain OR match can return documents that only contain the
      // short token — completely unrelated products (e.g. "30 m" matching "38").
      // Fix: require at least one long token to also match in the content fields.
      const queryTokens = q.trim().split(/\s+/);
      const longTokens = queryTokens.filter((t) => t.length >= 3);
      const needsLongWordGuard =
        queryTokens.some((t) => t.length < 3) && longTokens.length > 0;

      const longWordGuard: any[] = needsLongWordGuard
        ? [
            {
              bool: {
                should: longTokens.map((token) => ({
                  multi_match: {
                    query: token,
                    fields: [
                      `description.${lang}`,
                      `description.${lang}.normalized`,
                      `description.${lang}.iberian`,
                      `short_description.${lang}`,
                      `tags.${lang}`,
                    ],
                  },
                })),
                minimum_should_match: 1,
              },
            },
          ]
        : [];

      return {
        function_score: {
          query: {
            bool: {
              should: [
                {
                  dis_max: {
                    queries: mainQueries,
                    tie_breaker: 0.1,
                  },
                },
              ],
              minimum_should_match: 1,
              ...(needsLongWordGuard ? { must: longWordGuard } : {}),
              filter: filtersClause,
            },
          },

          // Additive fixed-value bonuses via function weights.
          // These are field-length-independent: weight is added as-is,
          // unlike `boost` on a match query which multiplies BM25.
          // Priority stack (all matching functions are summed):
          //   700 — description starts with query term (prefix)
          //   650 — description contains query term exactly
          //   600 — tags exact match
          //   450 — description first_word fuzzy (typo tolerance)
          //   300 — supplier name starts with query term
          //   200 — (multi-word) description matches head term — partial-match tiebreaker
          functions: [
            {
              filter: {
                bool: {
                  must: [
                    {
                      prefix: {
                        [`description.${lang}.keyword`]: {
                          value: q.split(" ")[0],
                          case_insensitive: true,
                        },
                      },
                    },
                    {
                      multi_match: {
                        query: q,
                        fields: [
                          `description.${lang}`,
                          `description.${lang}.normalized`,
                          `short_description.${lang}`,
                          `tags.${lang}`,
                        ],
                        type: "cross_fields",
                        operator: "and",
                      },
                    },
                  ],
                },
              },
              weight: 700,
            },
            {
              filter: {
                match: { [`description.${lang}`]: { query: q } },
              },
              weight: 650,
            },
            {
              // Only award the tags bonus when ALL query terms appear in tags —
              // a partial OR match would fire for any product that shares a
              // single token with the query (e.g. "cesto" matching "Cesto de
              // leña" for a "cesto vendimia" query).
              filter: {
                match: { [`tags.${lang}`]: { query: q, operator: "and" } },
              },
              weight: 600,
            },
            {
              // For single-word queries only the fuzzy first-word match is
              // required (typo recovery: "taldro" → "taladro").
              // For multi-word queries the cross-fields AND guard is also
              // required so a product that only matches the first term of the
              // query (e.g. "Cesto de leña" for "cesto vendimia") doesn't
              // collect this bonus.
              filter: {
                bool: {
                  must: [
                    {
                      match: {
                        [`description.${lang}.first_word`]: {
                          query: q.split(" ")[0],
                          fuzziness: 1,
                        },
                      },
                    },
                    ...(q.includes(" ")
                      ? [
                          {
                            multi_match: {
                              query: q,
                              fields: [
                                `description.${lang}`,
                                `description.${lang}.normalized`,
                                `short_description.${lang}`,
                                `tags.${lang}`,
                              ],
                              type: "cross_fields",
                              operator: "and",
                            },
                          } as any,
                        ]
                      : []),
                  ],
                },
              } as any,
              weight: 450,
            },
            {
              filter: {
                prefix: {
                  "supplier_name.keyword": {
                    value: q.split(" ")[0],
                    case_insensitive: true,
                  },
                },
              },
              weight: 300,
            },
            // Multi-word tiebreaker: when no document matches every query term,
            // prefer the one matching the head (first) term. For "mesa jardin"
            // this ranks "Mesa Dream - Wengué" (matches "mesa") above "Guante de
            // jardín" (matches only "jardin"), which otherwise wins on the higher
            // IDF of the rarer second term. Kept modest so it only orders partial
            // matches among themselves — full multi-term matches (650 + 700) still
            // dominate, so this won't resurface "Cesto de leña" for "cesto
            // vendimia" above true matches.
            ...(q.includes(" ")
              ? [
                  {
                    filter: {
                      match: {
                        [`description.${lang}`]: { query: q.split(" ")[0] },
                      },
                    },
                    weight: 200,
                  },
                ]
              : []),
          ],

          score_mode: "sum" as const,
          boost_mode: "sum" as const,
          max_boost: 3000,
        },
      };
    } else {
      return {
        bool: {
          filter: filtersClause,
        },
      };
    }
  }

  async searchCategoriesCount(
    lang: string,
    filters: ProductSearchFilters = { deleted: false },
    q?: string,
  ): Promise<any[]> {
    const tenantId = filters.tenantId?.toLowerCase();
    const index = this._productsIndex(tenantId);
    lang = lang.toLowerCase();

    const query = this._buildSearchQuery(lang, q, filters);

    const body = {
      query,
      size: 0,
      aggs: {
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
                      top_hits: { _source: [`level3Name.${lang}`], size: 1 },
                    },
                    ...(filters.type !== "edp"
                      ? {
                          unique_groups: {
                            cardinality: {
                              field: "grouping_code",
                              precision_threshold: 1000,
                            },
                          },
                        }
                      : {}),
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = await this.client.search({
      index,
      body,
    });

    const categories: any[] = [];
    const aggregations = result.aggregations as any;

    if (aggregations && aggregations.level1 && aggregations.level1.buckets) {
      for (const l1 of aggregations.level1.buckets) {
        const level1 = l1.key;
        const level1NameObj =
          l1.level1Name?.hits?.hits?.[0]?._source?.level1Name;
        const level1Name = level1NameObj ? level1NameObj[lang] : undefined;

        if (l1.level2 && l1.level2.buckets) {
          for (const l2 of l1.level2.buckets) {
            const level2 = l2.key;
            const level2NameObj =
              l2.level2Name?.hits?.hits?.[0]?._source?.level2Name;
            const level2Name = level2NameObj ? level2NameObj[lang] : undefined;

            if (l2.level3 && l2.level3.buckets) {
              for (const l3 of l2.level3.buckets) {
                const level3 = l3.key;
                const level3NameObj =
                  l3.level3Name?.hits?.hits?.[0]?._source?.level3Name;
                const level3Name = level3NameObj
                  ? level3NameObj[lang]
                  : undefined;
                const count =
                  filters.type !== "edp" && l3.unique_groups?.value > 0
                    ? l3.unique_groups.value
                    : l3.doc_count;

                categories.push({
                  level1,
                  level1Name,
                  level2,
                  level2Name,
                  level3,
                  level3Name,
                  count,
                });
              }
            }
          }
        }
      }
    }

    return categories;
  }

  /**
   * Characteristic facet filters for the current query + filters.
   * Returns each characteristic name with its distinct values and counts, in the
   * requested language. Names and values are sorted alphabetically (locale-aware)
   * here in the service, not in Elasticsearch — see the facets plan.
   */
  async searchFacets(
    lang: string,
    filters: ProductSearchFilters = { deleted: false },
    q?: string,
  ): Promise<Array<{ name: string; values: Array<{ value: string; count: number }> }>> {
    const tenantId = filters.tenantId?.toLowerCase();
    const index = this._productsIndex(tenantId);
    lang = lang.toLowerCase();

    const query = this._buildSearchQuery(lang, q, filters);

    // Request enough buckets to capture every distinct name and value; ordering
    // returned by ES is irrelevant since we sort below.
    const NAMES_SIZE = 200;
    const VALUES_SIZE = 200;

    const body = {
      query,
      size: 0,
      aggs: {
        characteristics: {
          nested: { path: "characteristics" },
          aggs: {
            by_lang: {
              filter: { term: { "characteristics.lang": lang } },
              aggs: {
                names: {
                  terms: { field: "characteristics.name", size: NAMES_SIZE },
                  aggs: {
                    values: {
                      terms: {
                        field: "characteristics.value",
                        size: VALUES_SIZE,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = await this.client.search({ index, body });

    const aggregations = result.aggregations as any;
    const nameBuckets =
      aggregations?.characteristics?.by_lang?.names?.buckets ?? [];

    const facets = nameBuckets.map((nb: any) => ({
      name: nb.key,
      values: (nb.values?.buckets ?? [])
        .map((vb: any) => ({ value: vb.key, count: vb.doc_count }))
        .sort((a: any, b: any) =>
          a.value.localeCompare(b.value, lang, { sensitivity: "base" }),
        ),
    }));

    facets.sort((a: any, b: any) =>
      a.name.localeCompare(b.name, lang, { sensitivity: "base" }),
    );

    return facets;
  }

  private _buildFilters(filters?: ProductSearchFilters, lang?: string) {
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

    // Selected characteristic facets, encoded as a flat "@@"-separated list
    // alternating name, value, name, value, ... e.g.
    //   Marca@@Bosch@@Capacidad de corte@@3 mm
    // "@@" is used as the only delimiter because characteristic values can
    // contain ":" and "," . Repeat a name to select several of its values.
    // Values of the same name are OR-ed (terms); different names are AND-ed
    // (separate nested clauses). Each clause is scoped to the requested language
    // via characteristics.lang.
    if (filters.characteristics) {
      // The value may arrive URL-encoded (e.g. "Marca%40%40Bosch"); decode it
      // before splitting. Fall back to the raw string if it isn't valid
      // percent-encoding so a stray "%" can't throw.
      let raw = filters.characteristics;
      try {
        raw = decodeURIComponent(raw);
      } catch {
        // keep raw as-is
      }
      const tokens = raw.split("@@");
      const valuesByName = new Map<string, string[]>();
      for (let i = 0; i + 1 < tokens.length; i += 2) {
        const name = tokens[i].trim();
        const value = tokens[i + 1].trim();
        if (!name || !value) continue;
        if (!valuesByName.has(name)) valuesByName.set(name, []);
        valuesByName.get(name)!.push(value);
      }

      for (const [name, values] of valuesByName) {
        const must: any[] = [
          { term: { "characteristics.name": name } },
          { terms: { "characteristics.value": values } },
        ];
        if (lang) {
          must.unshift({ term: { "characteristics.lang": lang } });
        }
        filterClauses.push({
          nested: {
            path: "characteristics",
            query: { bool: { must } },
          },
        });
      }
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
      const rateId =
        filters.rate && (!filters.type || filters.type === "own")
          ? filters.rate
          : null;
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
        { _score: { order: "desc" } },
      ];
    }

    if (field === "_score") {
      return undefined; // let ES handle default scoring sort
    }

    return [{ [field]: { order: direction } }, { _score: { order: "desc" } }];
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

  /**
   * Reduce the lang-tagged characteristics array to the requested language as a
   * list of { name, value }, sorted alphabetically (locale-aware). Entries are
   * lang-tagged (not {es,pt} sub-objects), so _flattenLangFields cannot pick the
   * language automatically.
   */
  private _localizeCharacteristics(
    characteristics: any,
    lang: string,
  ): Array<{ name: string; value: string }> {
    if (!Array.isArray(characteristics)) return [];
    return characteristics
      .filter((c) => c && c.lang === lang)
      .map((c) => ({ name: c.name, value: c.value }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, lang, { sensitivity: "base" }),
      );
  }

  async getCategoriesTree(
    tenantId: string,
    visibility: number,
    lang: string,
    supplierIds?: string[],
    deleted?: boolean,
  ): Promise<SupplierCategoriesTree[]> {
    const index = this._productsIndex(tenantId);

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
