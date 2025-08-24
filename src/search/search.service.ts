import { Injectable } from "@nestjs/common";
import { Client } from "@elastic/elasticsearch";
import { ProductSearchFilters } from "./search.types";
import { CategoryNode, ProductSearchResponse, ProductSearchResult, SupplierCategoriesTree } from "src/dto";

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

    console.log("QUERY: " + JSON.stringify(body.query));

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
    if (typeof filters.visibility === "number") {
      filterClauses.push({
        range: { visibility: { gte: filters.visibility } },
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
    lang: string
  ): Promise<SupplierCategoriesTree[]> {
    const index = "productscatalog-categories";

    const { hits } = await this.client.search({
      index,
      size: 10000,
      query: {
        bool: {
          filter: [
            { term: {tenant_id: tenantId } },
            { terms: { supplier_id: supplierIds } },
            { term: { disabled: false } },
          ],
        },
      },
      _source: [
        "supplier_id",
        "level1",
        "level2",
        "level3",
        `description.${lang}`,
      ],
    });

    const docs = hits.hits.map((hit: any) => hit._source);

    // Group by supplier
    const suppliers: Record<string, any> = {};

    docs.forEach((doc) => {
      const supplierId = doc.supplier_id;
      if (!suppliers[supplierId]) {
        suppliers[supplierId] = {};
      }

      const tree = suppliers[supplierId];
      const l1 = doc.level1;
      const l2 = doc.level2;
      const l3 = doc.level3;
      const desc = doc.description?.[lang] || "";

      if (!tree[l1]) {
        tree[l1] = { id: l1, description: desc, children: {} };
      }

      if (l2) {
        if (!tree[l1].children[l2]) {
          tree[l1].children[l2] = { id: l2, description: desc, children: {} };
        }

        if (l3) {
          if (!tree[l1].children[l2].children[l3]) {
            tree[l1].children[l2].children[l3] = {
              id: l3,
              description: desc,
              children: {},
            };
          }
        }
      }
    });

    const formatTree = (node: any): CategoryNode[] => {
      return Object.values(node).map((n: any) => ({
        id: n.id,
        description: n.description,
        children: formatTree(n.children || {}),
      }));
    };

    return Object.entries(suppliers).map(([supplierId, tree]) => ({
      supplierId,
      categories: formatTree(tree) as CategoryNode[],
    }));
  }
}
