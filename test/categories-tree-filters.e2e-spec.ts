import { SearchService } from '../src/search/search.service';

// Fake Elastic client: records the query so the category id filters can be
// asserted without a running Elasticsearch.
function serviceWithFakeClient(hits: any[] = []) {
  const search = jest.fn().mockResolvedValue({
    hits: { hits: hits.map((_source) => ({ _source })) },
    aggregations: { suppliers: { buckets: [] } },
  });
  const service = new SearchService({ client: { search } } as any);
  const query = () => search.mock.calls[0][0].body.query.bool;
  return { service, query, filters: () => query().filter };
}

const row = (level1: string, level2?: string, level3?: string, es = '') => ({
  supplier_id: 'internaco-own',
  level1,
  ...(level2 ? { level2 } : {}),
  ...(level3 ? { level3 } : {}),
  description: { es },
});

describe('categories tree level filters', () => {
  it('own tree accepts comma separated l1Id/l2Id lists', async () => {
    const { service, query } = serviceWithFakeClient();
    await service.getCategoriesTree('internaco', 0, 'es', 'own', undefined, undefined, '7,4', '1, 2');
    expect(query().filter).toContainEqual({ terms: { 'level1.keyword': ['7', '4'] } });
    expect(query().should).toContainEqual({
      bool: { filter: [{ terms: { 'level2.keyword': ['1', '2'] } }] },
    });
  });

  it('own tree also fetches the level1 name rows when filtering on l2Id', async () => {
    const { service, query } = serviceWithFakeClient();
    await service.getCategoriesTree('internaco', 0, 'es', 'own', undefined, undefined, '7', '1');
    expect(query().minimum_should_match).toBe(1);
    expect(query().should).toContainEqual({
      bool: { must_not: [{ exists: { field: 'level2.keyword' } }] },
    });
  });

  it('own tree names level1 and drops level1 nodes without an allowed level2', async () => {
    const { service } = serviceWithFakeClient([
      row('1', undefined, undefined, 'HUSQVARNA'),
      row('1', '1', undefined, 'MAQUINA'),
      row('2', undefined, undefined, 'OTRA'),
    ]);
    const [tree] = await service.getCategoriesTree('internaco', 0, 'es', 'own', undefined, undefined, '1,2', '1');
    expect(tree.categories).toHaveLength(1);
    expect(tree.categories![0]).toMatchObject({
      id: '1',
      description: 'HUSQVARNA',
      children: [{ id: '1', description: 'MAQUINA' }],
    });
  });

  it('own tree with l3Id keeps level1/level2 names and prunes empty branches', async () => {
    const { service } = serviceWithFakeClient([
      row('1', undefined, undefined, 'HUSQVARNA'),
      row('1', '1', undefined, 'MAQUINA'),
      row('1', '1', '1017642', 'CORTACESPEDES'),
      row('1', '2', undefined, 'REPUESTO'),
    ]);
    const [tree] = await service.getCategoriesTree('internaco', 0, 'es', 'own', undefined, undefined, undefined, undefined, '1017642');
    expect(tree.categories).toEqual([
      {
        id: '1',
        description: 'HUSQVARNA',
        children: [
          { id: '1', description: 'MAQUINA', children: [{ id: '1017642', description: 'CORTACESPEDES' }] },
        ],
      },
    ]);
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
