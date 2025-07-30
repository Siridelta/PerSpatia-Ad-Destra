import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism.css';

/**
 * 语法高亮服务类
 * 提供对 contentEditable 元素的 JavaScript 语法高亮功能
 */
export class SyntaxHighlighter {
  private highlightElement: HTMLElement | null = null;
  private textElement: HTMLElement | null = null;

  /**
   * 初始化语法高亮器
   * @param textElement 可编辑的文本元素
   * @param highlightElement 用于显示高亮的元素
   */
  initialize(textElement: HTMLElement, highlightElement: HTMLElement) {
    this.textElement = textElement;
    this.highlightElement = highlightElement;
    
    // 设置初始样式
    this.setupStyles();
    
    // 监听输入事件
    this.setupEventListeners();
    
    // 初始高亮
    this.updateHighlight();
  }

  /**
   * 设置样式以使编辑器和高亮层重叠
   */
  private setupStyles() {
    if (!this.textElement || !this.highlightElement) return;

    // 确保两个元素具有相同的样式
    const commonStyles = {
      fontFamily: 'JetBrains Mono, 阿里妈妈方圆体, monospace',
      fontSize: '14px',
      lineHeight: '1.5',
      padding: '8px',
      margin: '0',
      border: 'none',
      outline: 'none',
      whiteSpace: 'pre-wrap' as const,
      wordWrap: 'break-word' as const,
      position: 'absolute' as const,
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      boxSizing: 'border-box' as const,
      overflow: 'auto',
    };

    // 应用共同样式
    Object.assign(this.textElement.style, commonStyles, {
      background: 'transparent',
      color: 'transparent',
      caretColor: '#7dd3fc', // 蓝绿色光标
      zIndex: '2',
      resize: 'none',
    });

    Object.assign(this.highlightElement.style, commonStyles, {
      background: 'transparent',
      color: 'inherit',
      zIndex: '1',
      pointerEvents: 'none',
    });

    // 确保父容器具有正确的样式
    const container = this.textElement.parentElement;
    if (container) {
      container.style.position = 'relative';
      container.style.overflow = 'hidden';
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners() {
    if (!this.textElement) return;

    // 监听输入事件
    this.textElement.addEventListener('input', this.handleInput.bind(this));
    
    // 监听滚动事件，保持同步
    this.textElement.addEventListener('scroll', this.syncScroll.bind(this));
    
    // 监听键盘事件处理制表符
    this.textElement.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * 处理输入事件
   */
  private handleInput() {
    // 延迟更新高亮，避免过于频繁的更新
    setTimeout(() => {
      this.updateHighlight();
    }, 10);
  }

  /**
   * 同步滚动位置
   */
  private syncScroll() {
    if (!this.textElement || !this.highlightElement) return;
    
    this.highlightElement.scrollTop = this.textElement.scrollTop;
    this.highlightElement.scrollLeft = this.textElement.scrollLeft;
  }

  /**
   * 处理键盘事件
   */
  private handleKeyDown(event: KeyboardEvent) {
    // 处理 Tab 键插入制表符
    if (event.key === 'Tab') {
      event.preventDefault();
      this.insertTab();
    }
  }

  /**
   * 插入制表符
   */
  private insertTab() {
    if (!this.textElement) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const tabNode = document.createTextNode('\t');
    
    range.deleteContents();
    range.insertNode(tabNode);
    range.setStartAfter(tabNode);
    range.setEndAfter(tabNode);
    
    selection.removeAllRanges();
    selection.addRange(range);
    
    // 触发输入事件
    this.textElement.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * 更新语法高亮
   */
  private updateHighlight() {
    if (!this.textElement || !this.highlightElement) return;

    const code = this.textElement.textContent || '';
    
    // 处理最后的换行符（确保光标位置正确）
    let processedCode = code;
    if (code.endsWith('\n')) {
      processedCode = code + ' '; // 添加空格使最后一行可见
    }

    // 转义 HTML 字符
    const escapedCode = this.escapeHtml(processedCode);
    
    try {
      // 使用 Prism 进行语法高亮
      const highlightedCode = Prism.highlight(escapedCode, Prism.languages.javascript, 'javascript');
      this.highlightElement.innerHTML = highlightedCode;
    } catch (error) {
      console.warn('语法高亮失败:', error);
      // 回退到纯文本显示
      this.highlightElement.textContent = processedCode;
    }

    // 同步滚动位置
    this.syncScroll();
  }

  /**
   * 转义 HTML 字符
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 设置代码内容
   */
  setCode(code: string) {
    if (!this.textElement) return;
    
    this.textElement.textContent = code;
    this.updateHighlight();
  }

  /**
   * 获取代码内容
   */
  getCode(): string {
    return this.textElement?.textContent || '';
  }

  /**
   * 销毁高亮器
   */
  destroy() {
    if (this.textElement) {
      this.textElement.removeEventListener('input', this.handleInput.bind(this));
      this.textElement.removeEventListener('scroll', this.syncScroll.bind(this));
      this.textElement.removeEventListener('keydown', this.handleKeyDown.bind(this));
    }
    
    this.textElement = null;
    this.highlightElement = null;
  }
}

// 导出单例实例
export const syntaxHighlighter = new SyntaxHighlighter(); 