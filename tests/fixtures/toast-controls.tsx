/** @jsxImportSource preact */
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { Button, Dialog, ToastViewport } from '../../src/ui/components/common';
import { toastService } from '../../src/services/ToastService';
import '../../src/styles/cinematic/design-system.css';
const message = 'Изменения не сохранены. Мир изменён в другой вкладке. Оставьте эту вкладку открытой. ';
function Fixture() {
  const [open, setOpen] = useState(false), [nested, setNested] = useState(false), [count, setCount] = useState(0);
  const notify = (tone: 'error' | 'success' | 'warning' | 'info', long = false) => toastService.show(message.repeat(long ? 30 : 1), tone, 60000);
  const controls = <><Button onClick={() => notify('error', true)}>Длинная ошибка</Button><Button onClick={() => notify('success')}>Успех</Button><Button onClick={() => notify('warning')}>Предупреждение</Button><Button onClick={() => notify('info')}>Информация</Button><Button onClick={() => setCount(count + 1)}>Важное действие {count}</Button></>;
  return <div className="role-entry" style={{ minHeight: '100dvh', background: '#090d12', color: '#f3ead8', padding: '16px', boxSizing: 'border-box' }}>
    <Button onClick={() => setOpen(true)}>Открыть окно</Button>{controls}
    {open && <Dialog aria-label="Проверка уведомлений" onClose={() => setOpen(false)}>
      <header style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}><span>Проверка уведомлений</span><Button onClick={() => setOpen(false)}>Закрыть окно</Button></header>
      <div style={{ minHeight: 0, overflow: 'auto', maxWidth: '600px' }}>{controls}<Button onClick={() => setNested(true)}>Вложенное окно</Button></div>
      <footer><Button onClick={() => setCount(count + 1)}>Сохранить {count}</Button></footer>
    </Dialog>}
    {nested && <Dialog aria-label="Вложенное" title="Вложенное" onClose={() => setNested(false)}><Button onClick={() => setNested(false)}>Назад</Button></Dialog>}
    <ToastViewport />
  </div>;
}
render(<Fixture />, document.getElementById('root')!);
