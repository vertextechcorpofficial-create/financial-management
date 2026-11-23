// Serializes voucher mutations in this server process. Multi-instance deployments
// still require a database transaction/row lock for cross-instance atomicity.
const globalLocks = globalThis as typeof globalThis & { disbursementMutationLocks?: Map<number, Promise<void>> };
const locks = globalLocks.disbursementMutationLocks ??= new Map();

export async function acquireDisbursementMutationLock(id: number): Promise<() => void> {
    const previous = locks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => current);
    locks.set(id, tail);
    await previous;
    return () => {
        release();
        if (locks.get(id) === tail) locks.delete(id);
    };
}
