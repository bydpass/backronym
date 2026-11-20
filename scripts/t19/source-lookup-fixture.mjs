// 测试用：按编译源的原形和词形分组。每个可能冲突的义项仍由正式查询规则逐项判断。
export function sourceSubset(records, fold) {
  const key = word => fold(word.replace(/[’ʼ‘`´]/g, "'"));
  const buckets = new Map();
  for (const record of records) {
    const forms = records.formsBySense[record.sense_id] || [];
    for (const k of new Set([record.display, ...forms].map(key))) {
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(record);
    }
  }
  for (const bucket of buckets.values()) {
    Object.defineProperties(bucket, {
      formsBySense: {value: records.formsBySense},
      guards: {value: records.guards}
    });
  }
  return word => buckets.get(key(word)) || [];
}
