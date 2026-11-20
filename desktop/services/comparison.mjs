// [p4-m2] Save a comparison table from a chat reply into 成果中心 as XLSX or DOCX (the spec is re-validated here).
import { generateDocument } from '../runtime/documents.mjs';
import { normalizeComparison, comparisonXlsx, comparisonDocx } from '../src/shared/comparison.js';

export function createComparisonService({documents, store, notify = () => {}}) {
  return {
    async handle(p) {
      if (p?.action !== 'export') throw new Error('未知操作');
      if (!['xlsx', 'docx'].includes(p.format)) throw new Error('导出格式无效');
      if (!documents) throw new Error('当前环境不能保存文档');
      const spec = normalizeComparison(typeof p.spec === 'string' ? p.spec : JSON.stringify(p.spec ?? null));
      const content = JSON.stringify(p.format === 'xlsx' ? comparisonXlsx(spec) : comparisonDocx(spec));
      const {bytes} = await generateDocument(p.format, content);
      const name = ('对比-' + spec.title).replace(/[\\/:*?"<>|\n]/g, ' ').slice(0, 80);
      const saved = await documents.importFile(name, p.format, bytes);
      const doc = saved?.document || saved;
      store?.log?.('已保存对比表', `${name}.${p.format}`);
      notify();
      return {id: doc?.id, name: doc?.name || name, format: p.format};
    },
  };
}
