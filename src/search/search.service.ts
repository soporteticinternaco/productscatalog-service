import { Injectable } from "@nestjs/common";
import { Client } from "@elastic/elasticsearch";
import {
  CategoriesTreeAggregation,
  OwnCategoryDoc,
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
    lang: string,
    page: number = 0,
    limit: number = 10,
    filters: ProductSearchFilters = { deleted: false },
    q?: string,
    sortBy?: string,
  ): Promise<ProductSearchResponse> {
    const tenantId = filters.tenantId?.toLowerCase();
    const index = `productscatalog-${tenantId}-products-current`;
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
      "replaces",
      "main_picture_url",
      "main_picture_thumb_url",
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

    if (q && page === 0) {
      const exactRefHit = await this._findExactRefMatch(
        index,
        q,
        filters,
        response_fields,
      );
      if (exactRefHit) {
        return {
          navigation: { total: 1, page: 0, limit, count: 1 },
          data: [this._flattenHit(exactRefHit, lang, q, filters)],
        };
      }
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

    console.log(
      "================================= page: " +
        page +
        ", limit: " +
        limit +
        ", isGrouping: " +
        isGrouping,
    );

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

    const data = (
      isGrouping ? result.hits.hits.slice(0, limit) : result.hits.hits
    ).map((hit: any) => this._flattenHit(hit, lang, q, filters));

    return {
      navigation,
      data,
    };
  }

  // Exact ref/SKU lookup: if `q` exactly matches a product's `ref` (e.g. a
  // user searching their own reference code), that's an unambiguous match —
  // return just that one product, skipping the fuzzy/relevance query
  // entirely. This has to run as its own dedicated query rather than "check
  // whether the top-ranked fuzzy result happens to have this ref": relevance
  // scoring is noisy (fuzzy matches, phonetic, synonym expansion, multiple
  // additive bonuses), so the correct doc isn't guaranteed to rank #1 or even
  // appear in the page — it can get buried under unrelated results that
  // happen to fuzzy-match parts of the query. `case_insensitive: true`
  // because `ref.keyword` is an unanalyzed field — a `term` query against it
  // is exact-case by default, and users don't reliably type SKUs in the
  // stored case.
  private async _findExactRefMatch(
    index: string,
    q: string,
    filters: ProductSearchFilters,
    sourceFields: string[],
  ): Promise<any | null> {
    // sa92-only: also matches when `q` equals the *stored* ref with its
    // first 2 characters stripped (e.g. q="K00401124" finding a product
    // stored as "47K00401124").
    const refMatchClause =
      filters.tenantId?.toLowerCase() === "sa92"
        ? {
            bool: {
              should: [
                {
                  term: {
                    "ref.keyword": { value: q, case_insensitive: true },
                  },
                },
                {
                  script: {
                    script: {
                      lang: "painless",
                      source:
                        "doc['ref.keyword'].size() > 0 && doc['ref.keyword'].value.length() > 2 && doc['ref.keyword'].value.substring(2).equalsIgnoreCase(params.value)",
                      params: { value: q },
                    },
                  },
                },
              ],
              minimum_should_match: 1,
            },
          }
        : { term: { "ref.keyword": { value: q, case_insensitive: true } } };

    const result = await this.client.search({
      index,
      size: 1,
      _source: sourceFields,
      query: {
        bool: {
          filter: [...this._buildFilters(filters), refMatchClause],
        },
      },
    });

    return (result.hits.hits[0] as any) ?? null;
  }

  // Maps ES's stored (snake_case) document field names to the API's
  // camelCase output contract. Only covers fields that actually reach
  // _flattenHit's output — the ES index schema itself is unaffected
  // (response_fields / query field references elsewhere still use the
  // real, snake_case stored field names).
  private static readonly FIELD_RENAME_MAP: Record<string, string> = {
    supplier_id: "supplierId",
    supplier_name: "supplierName",
    container_units: "containerUnits",
    container_type: "containerType",
    main_picture_url: "mainPictureUrl",
    main_picture_thumb_url: "mainPictureThumbUrl",
    short_description: "shortDescription",
    net_price: "netPrice",
    sale_price: "salePrice",
    net_price_with_margin: "netPriceWithMargin",
    vat_amount: "vatAmount",
  };

  private _toCamelCaseFields(item: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const key of Object.keys(item)) {
      result[SearchService.FIELD_RENAME_MAP[key] ?? key] = item[key];
    }
    return result;
  }

  private _flattenHit(
    hit: any,
    lang: string,
    q: string | undefined,
    filters: ProductSearchFilters,
  ): ProductSearchResult {
    const src = hit._source || {};
    const flattened = this._flattenLangFields(src, lang) as ProductSearchResult;

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

    // Flags the hit when `q` exactly matches one of its deprecated
    // `replaces` references, mirroring the exact `term` boost added in
    // `_buildSearchQuery`. Computed from `_source` rather than ES
    // `matched_queries`, since `replaces` is already fetched for this.
    const applyReplacesMatch = (item: any, rawSrc: any) => {
      item.isReplacementOf =
        !!q && Array.isArray(rawSrc.replaces) && rawSrc.replaces.includes(q);
      delete item.replaces;
      return item;
    };

    if (hit.inner_hits && hit.inner_hits.grouped_items) {
      (flattened as any).groupedItems = hit.inner_hits.grouped_items.hits.hits
        .filter((innerHit: any) => innerHit._id !== hit._id)
        .map((innerHit: any) => {
          const innerFlattened = this._flattenLangFields(
            innerHit._source,
            lang,
          ) as any;
          applyReplacesMatch(innerFlattened, innerHit._source);
          applyRatePrice(innerFlattened, innerHit._source);
          return this._toCamelCaseFields(innerFlattened);
        });
    }

    applyReplacesMatch(flattened, src);
    applyRatePrice(flattened, src);

    return this._toCamelCaseFields(flattened) as ProductSearchResult;
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
    const filtersClause = this._buildFilters(filters);

    if (q && q.length > 0) {
      const mainQueries: any[] = [
        // 🔹 Exact boosts (cheap & important)
        { term: { "ref.keyword": { value: q, boost: 20 } } },
        { term: { "ean.keyword": { value: q, boost: 20 } } },
        // Exact match only — `replaces` is a keyword field, so this never
        // partially/fuzzily matches a deprecated reference.
        { term: { replaces: { value: q, boost: 20 } } },

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
              // For multi-word queries we additionally require a full
              // cross-fields AND match — otherwise a doc whose description
              // merely starts with the first query word (e.g. "mesa" for
              // "mesa jardin") would get this bonus even if it doesn't
              // mention the rest of the query at all.
              //
              // For single-word queries that AND requirement backfires: a
              // truncated/partial word (e.g. "pulveriz" for "pulverizador")
              // is never a complete indexed token anywhere, so the AND check
              // can never succeed and the whole bonus silently never fires —
              // even though the prefix match alone is already a strong,
              // unambiguous signal (only the intended product actually
              // starts with what the user typed). So for single-word
              // queries we rely on the prefix check alone.
              //
              // Prefix check runs against `.iberian` (accent-folding),
              // NOT the raw `.keyword` field — `.keyword` is unanalyzed and
              // only `case_insensitive`, so "Cortacésped ..." would never
              // prefix-match a "cortacesped" query (missing accent is a
              // literal character mismatch). `span_first`+`span_multi`+
              // `prefix` reproduces "field starts with this word" on the
              // analyzed field: it requires a term within the first token
              // position whose (accent-folded) text is a prefix of the
              // query's first word.
              filter: {
                bool: {
                  must: [
                    {
                      span_first: {
                        match: {
                          span_multi: {
                            match: {
                              prefix: {
                                [`description.${lang}.iberian`]:
                                  q.split(" ")[0].toLowerCase(),
                              },
                            },
                          },
                        },
                        end: 1,
                      } as any,
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
              },
              weight: 700,
            },
            {
              // Without fuzziness, this bonus (the 2nd-largest, after the
              // prefix bonus) requires an exact token match, so a single
              // typo ("cortasesped" for "cortacesped") loses out on 650 of
              // the ~2000+ points a correctly-spelled query earns, producing
              // a very different top-ranked set for what should be a near-
              // identical query. fuzziness 1 (not AUTO:3,5) deliberately —
              // description.{lang} is already accent-folded at index time,
              // so a single-letter typo is only 1 edit away; going to 2
              // edits let coincidental collisions on unrelated words (e.g.
              // "escada" → "escuadra", a completely different tool, 2 edits
              // apart) collect this same bonus and outrank genuine matches.
              filter: {
                match: {
                  [`description.${lang}`]: { query: q, fuzziness: 1 },
                },
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
              // Fuzzy counterpart of the 600 bonus above, at a much lower
              // weight. The 600 bonus is deliberately exact (no fuzziness —
              // a fuzzy OR-of-tags match risks matching unrelated products
              // on a shared misspelled-adjacent token). But with exactness
              // on both 700 (prefix) and 600 gone under a typo, every
              // product that matches at all collapses to one identical
              // score — ties then fall back to Elasticsearch's internal
              // doc/segment order, which is arbitrary and unstable. This
              // restores *some* differentiation for typo'd queries without
              // reopening the false-positive risk: it's low enough that it
              // only breaks ties among already-matching products, never
              // outranks the exact-match tiers above it. fuzziness 1, same
              // reasoning as the 650 bonus above — 2 edits is loose enough
              // to match unrelated words and let them collect this bonus
              // too, defeating the point of keeping 600 itself exact.
              filter: {
                match: {
                  [`tags.${lang}`]: {
                    query: q,
                    operator: "and",
                    fuzziness: 1,
                  },
                },
              },
              weight: 100,
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
            // Recall is intentionally accent/b-v insensitive (iberian_normalization
            // folds "látex"~"latex", "vaca"~"baca", etc. so typos and inconsistent
            // source data don't cost us matches). But when a document contains the
            // *exact* characters the user typed, it's a slightly better match than
            // one that only matches through that folding — e.g. searching "látex"
            // should nudge products literally spelled "látex" a little ahead of
            // ones that only match via the accent fold. description.${lang}.keyword
            // is the raw, unanalyzed field, so this check bypasses all folding.
            // Kept modest (below every other bonus) — a tie-breaker, not a gate.
            {
              filter: {
                wildcard: {
                  [`description.${lang}.keyword`]: {
                    value: `*${q.replace(/[\\*?]/g, "\\$&")}*`,
                    case_insensitive: true,
                  },
                },
              },
              weight: 150,
            },
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
    const index = `productscatalog-${tenantId}-products-current`;
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
      filterClauses.push({ term: { "level1.keyword": filters.l1Id } });
    }
    if (filters.l2Id) {
      filterClauses.push({ term: { "level2.keyword": filters.l2Id } });
    }
    if (filters.l3Id) {
      filterClauses.push({ term: { "level3.keyword": filters.l3Id } });
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
      // Explicit tiebreak on id.keyword: plain `_score desc` leaves ties
      // (common for typo'd queries, where several products can land on the
      // exact same function_score total) to Elasticsearch's internal
      // doc/segment order — arbitrary, and liable to shuffle between
      // requests as segments merge. id.keyword gives a stable, deterministic
      // order among tied documents without affecting anything that's
      // actually differentiated by score.
      return [
        { _score: { order: "desc" } },
        { "id.keyword": { order: "asc" } },
      ];
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

  async getCategoriesTree(
    tenantId: string,
    visibility: number,
    lang: string,
    type: string = "edp",
    supplierIds?: string,
    deleted?: boolean,
    l1Id?: string,
    l2Id?: string,
    l3Id?: string,
  ): Promise<SupplierCategoriesTree[]> {
    if (type === "own") {
      return this.getOwnCategoriesTree(tenantId, lang, deleted, l1Id, l2Id, l3Id);
    }

    const index = `productscatalog-${tenantId.toLocaleLowerCase()}-products-current`;

    const filters: Array<Record<string, any>> = [
      { term: { "tenant_id.keyword": tenantId.toLowerCase() } },
    ];

    if (supplierIds) {
      // Express still parses a repeated query param (?supplierIds=A&supplierIds=B)
      // into a real array despite the `string` contract, so guard against
      // that rather than crash on `.split` — a caller-controlled input
      // shape shouldn't 500 the request.
      const supplierIdList = Array.isArray(supplierIds)
        ? supplierIds
        : supplierIds.split(",");
      filters.push({ terms: { "supplier_id.keyword": supplierIdList } });
    }

    if (visibility) {
      filters.push({ range: { supplier_visibility: { gte: visibility } } });
    }

    if (deleted !== undefined) {
      filters.push({ term: { deleted } });
    } else {
      filters.push({ term: { deleted: false } });
    }

    if (l1Id) {
      filters.push({ term: { "level1.keyword": l1Id } });
    }
    if (l2Id) {
      filters.push({ term: { "level2.keyword": l2Id } });
    }
    if (l3Id) {
      filters.push({ term: { "level3.keyword": l3Id } });
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

  async getOwnCategoriesTree(
    tenantId: string,
    lang: string,
    deleted?: boolean,
    l1Id?: string,
    l2Id?: string,
    l3Id?: string,
  ): Promise<SupplierCategoriesTree[]> {
    const index = `productscatalog-${tenantId.toLocaleLowerCase()}-categories-current`;

    const filters: Array<Record<string, any>> = [
      { term: { "tenant_id.keyword": tenantId.toLowerCase() } },
      { term: { "supplier_id.keyword": `${tenantId.toLowerCase()}-own` } },
    ];

    if (deleted !== undefined) {
      filters.push({ term: { disabled: deleted } });
    } else {
      filters.push({ term: { disabled: false } });
    }

    if (l1Id) {
      filters.push({ term: { "level1.keyword": l1Id } });
    }
    if (l2Id) {
      filters.push({ term: { "level2.keyword": l2Id } });
    }
    if (l3Id) {
      filters.push({ term: { "level3.keyword": l3Id } });
    }

    const { hits } = await this.client.search({
      index,
      size: 10000,
      body: {
        query: {
          bool: {
            filter: filters,
          },
        },
      },
    });

    const docs = (hits.hits as Array<{ _source: OwnCategoryDoc }>).map(
      (h) => h._source,
    );

    return this.buildOwnCategoriesTree(docs, lang);
  }

  buildOwnCategoriesTree(
    docs: OwnCategoryDoc[],
    lang: string,
  ): SupplierCategoriesTree[] {
    type BuildNode = {
      id: string;
      description: string;
      children: Map<string, BuildNode>;
    };

    const getOrCreate = (
      map: Map<string, BuildNode>,
      id: string,
    ): BuildNode => {
      let node = map.get(id);
      if (!node) {
        node = { id, description: "", children: new Map() };
        map.set(id, node);
      }
      return node;
    };

    // supplier_id is ignored on purpose: categories are the same taxonomy
    // shared across suppliers, so rows are merged/deduped by
    // (level1, level2, level3) id regardless of which supplier they came from.
    const level1Map = new Map<string, BuildNode>();

    for (const doc of docs) {
      const description = doc.description?.[lang] || "";

      const l1Node = getOrCreate(level1Map, doc.level1);
      if (!doc.level2) {
        l1Node.description = description;
        continue;
      }

      const l2Node = getOrCreate(l1Node.children, doc.level2);
      if (!doc.level3) {
        l2Node.description = description;
        continue;
      }

      const l3Node = getOrCreate(l2Node.children, doc.level3);
      l3Node.description = description;
    }

    const toCategoryNode = (node: BuildNode): CategoryNode => {
      const children = Array.from(node.children.values())
        .map(toCategoryNode)
        .sort((a, b) =>
          (a.description || "").localeCompare(b.description || ""),
        );
      return {
        id: node.id,
        description: node.description,
        ...(node.children.size > 0 ? { children } : {}),
      };
    };

    return [
      {
        supplierId: null as unknown as string,
        categories: Array.from(level1Map.values())
          .map((l1) => toCategoryNode(l1))
          .sort((a, b) =>
            (a.description || "").localeCompare(b.description || ""),
          ),
      },
    ];
  }
}
