import { useState } from 'react';
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { useSettings } from '../store/settings';
import { testDeepSeek } from '../ai/annotate';

export function AISettingsPanel() {
  const ai = useSettings((s) => s.ai);
  const setAI = useSettings((s) => s.setAI);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState('');

  async function test() {
    setTesting(true);
    setResult('');
    try {
      const reply = await testDeepSeek(ai);
      setResult(`连接成功：${reply}`);
    } catch (error) {
      setResult(`连接失败：${(error as Error).message.slice(0, 120)}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="settings-group">
      <div className="ai-callout">
        <Sparkles size={18} />
        <p>
          在书中选中一段文字后，选择「AI 注释」，DeepSeek 会结合上下文
          {ai.searchProvider === 'none' ? '' : '与联网搜索结果'}给出解释，结果会自动存为笔记。
        </p>
      </div>

      <label className="field">
        <span>DeepSeek API Key</span>
        <div className="field__input">
          <input
            type={showKey ? 'text' : 'password'}
            value={ai.apiKey}
            placeholder="sk-..."
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setAI({ apiKey: event.target.value.trim() })}
          />
          <button
            className="icon-button"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? '隐藏' : '显示'}
          >
            {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </label>

      <div className="field-row">
        <label className="field">
          <span>接口地址</span>
          <input
            value={ai.baseUrl}
            placeholder="https://api.deepseek.com"
            onChange={(event) => setAI({ baseUrl: event.target.value })}
          />
        </label>
        <label className="field field--narrow">
          <span>模型</span>
          <input
            value={ai.model}
            placeholder="deepseek-chat"
            onChange={(event) => setAI({ model: event.target.value })}
          />
        </label>
      </div>

      <div className="section-label">模型强度</div>
      <div className="segmented">
        {[
          { id: 'low', label: 'Low' },
          { id: 'medium', label: 'Medium' },
          { id: 'high', label: 'High' },
        ].map((item) => (
          <button
            key={item.id}
            className={ai.effort === item.id ? 'is-active' : ''}
            onClick={() => setAI({ effort: item.id as typeof ai.effort })}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="hint-text">
        控制 AI 注释和追问的回答长度与思考深度。Low 更快、答案更短，默认使用 Low；需要更详细的解释时再切到 Medium / High。
      </p>

      <div className="section-label">导入时自动分类</div>
      <div className="setting-toggle">
        <div>
          <strong>AI 自动归类</strong>
          <p className="hint-text">
            每次导入图书后由 DeepSeek 判断类型，并自动创建 / 归入分类；没有 Key
            或请求失败时退回本地关键词规则。
          </p>
        </div>
        <button
          className={`switch ${ai.autoClassify ? 'is-on' : ''}`}
          role="switch"
          aria-checked={ai.autoClassify}
          onClick={() => setAI({ autoClassify: !ai.autoClassify })}
        >
          <span />
        </button>
      </div>

      <div className="section-label">联网搜索</div>
      <div className="segmented">
        {[
          { id: 'none', label: '不联网' },
          { id: 'tavily', label: 'Tavily' },
          { id: 'bing', label: 'Bing' },
        ].map((item) => (
          <button
            key={item.id}
            className={ai.searchProvider === item.id ? 'is-active' : ''}
            onClick={() => setAI({ searchProvider: item.id as typeof ai.searchProvider })}
          >
            {item.label}
          </button>
        ))}
      </div>

      {ai.searchProvider !== 'none' ? (
        <>
          <label className="field">
            <span>{ai.searchProvider === 'tavily' ? 'Tavily API Key' : 'Bing Search API Key'}</span>
            <input
              type="password"
              value={ai.searchKey}
              placeholder="搜索服务 Key"
              autoComplete="off"
              onChange={(event) => setAI({ searchKey: event.target.value.trim() })}
            />
          </label>
          <p className="hint-text">
            {ai.searchProvider === 'tavily'
              ? 'Tavily 的 Key 可在 tavily.com 申请。'
              : 'Bing 搜索需要在 Azure 门户创建 Bing Search 资源并获取 Key；未填 Key 时注释只使用模型知识。'}
          </p>
        </>
      ) : (
        <p className="hint-text">
          不联网时仅使用模型自身知识。DeepSeek 接口本身不含联网能力，需自备搜索服务 Key。
        </p>
      )}

      <div className="slider-row">
        <div className="slider-row__head">
          <span>上下文长度</span>
          <span className="slider-row__value">前后各 {ai.contextChars} 字</span>
        </div>
        <input
          type="range"
          min={400}
          max={3000}
          step={100}
          value={ai.contextChars}
          onChange={(event) => setAI({ contextChars: Number(event.target.value) })}
        />
      </div>

      <button className="ghost-button" onClick={() => void test()} disabled={testing}>
        {testing ? <Loader2 size={16} className="spin" /> : null}
        {testing ? '正在测试…' : '测试连接'}
      </button>
      {result ? <p className={result.startsWith('连接成功') ? 'ok-text' : 'error-text'}>{result}</p> : null}
      <p className="hint-text">API Key 只保存在本机，不会上传到除 DeepSeek 之外的任何服务。</p>
    </div>
  );
}
