import { SearchService } from '../src/search/search.service';

// Fake Elastic client: records the query so the category id filters can be
// asserted without a running Elasticsearch.
function serviceWithFakeClient() {
  const search = jest.fn().mockResolvedValue({
    hits: { hits: [] },
    aggregations: { suppliers: { buckets: [] } },
  });
  const service = new SearchService({ client: { search } } as any);
  const filters = () => search.mock.calls[0][0].body.query.bool.filter;
  return { service, filters };
}

describe('categories tree level filters', () => {
  it('own tree accepts comma separated l1Id/l2Id/l3Id lists', async () => {
    const { service, filters } = serviceWithFakeClient();
    await service.getCategoriesTree('internaco', 0, 'es', 'own', undefined, undefined, '7,4', '1, 2', '3');
    expect(filters()).toEqual(
      expect.arrayContaining([
        { terms: { 'level1.keyword': ['7', '4'] } },
        { terms: { 'level2.keyword': ['1', '2'] } },
        { terms: { 'level3.keyword': ['3'] } },
      ]),
    );
  });

  it('supplier tree accepts comma separated l1Id/l2Id lists', async () => {
    const { service, filters } = serviceWithFakeClient();
    await service.getCategoriesTree('internaco', 0, 'es', 'edp', undefined, undefined, '7,4', '1,2');
    expect(filters()).toEqual(
      expect.arrayContaining([
        { terms: { 'level1.keyword': ['7', '4'] } },
        { terms: { 'level2.keyword': ['1', '2'] } },
      ]),
    );
  });

  it('a single id still works', async () => {
    const { service, filters } = serviceWithFakeClient();
    await service.getCategoriesTree('internaco', 0, 'es', 'own', undefined, undefined, '7');
    expect(filters()).toContainEqual({ terms: { 'level1.keyword': ['7'] } });
  });
});
