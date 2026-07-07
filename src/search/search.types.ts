export type ProductSearchFilters = {
  id?: string;
  supplierId?: string;
  ref?: string;
  ean?: string;
  l1Id?: string;
  l2Id?: string;
  l3Id?: string;
  deleted?: boolean;
  visibility?: number;
  tenantId?: string;
  type?: string;
  grouping?: boolean;
  rate?: string;
  characteristics?: string;
};

export type SupplierCat = {
  key: string;
  supplier_name: {
    hits: {
      hits: Array<{
        _source: { supplier_name: string };
      }>;
    };
  };
  level1: {
    buckets: Array<{
      key: string;
      level1Name: {
        hits: {
          hits: Array<{
            _source: {
              level1Name: Record<string, string>;
            };
          }>;
        };
      };
      level2: {
        buckets: Array<{
          key: string;
          level2Name: {
            hits: {
              hits: Array<{
                _source: {
                  level2Name: Record<string, string>;
                };
              }>;
            };
          };
          level3: {
            buckets: Array<{
              key: string;
              level3Name: {
                hits: {
                  hits: Array<{
                    _source: {
                      level3Name: Record<string, string>;
                    };
                  }>;
                };
              };
            }>;
          };
        }>;
      };
    }>;
  };
};

export type CategoriesTreeAggregation = {
  suppliers: {
    buckets: SupplierCat[];
  };
};
