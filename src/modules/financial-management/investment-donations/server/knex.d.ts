declare module "knex" {
  interface QueryBuilder<T = Record<string, unknown>[]> extends PromiseLike<T> {
    where(...args: unknown[]): QueryBuilder<T>;
    whereIn(...args: unknown[]): QueryBuilder<T>;
    orderBy(...args: unknown[]): QueryBuilder<T>;
    limit(...args: unknown[]): QueryBuilder<T>;
    select(...args: unknown[]): QueryBuilder<T>;
    first(...args: unknown[]): QueryBuilder<T>;
  }
  interface Knex extends QueryBuilder<unknown> {
    (table: string): QueryBuilder<Record<string, unknown>[]>;
    transaction<T>(handler: (trx: Knex) => Promise<T>, options?: Record<string, unknown>): Promise<T>;
  }
  interface KnexOptions { [key: string]: unknown }
  const knex: (options: KnexOptions) => Knex;
  export { knex as default };
  export { Knex };
  namespace Knex {
    type Transaction = Knex;
  }
}
