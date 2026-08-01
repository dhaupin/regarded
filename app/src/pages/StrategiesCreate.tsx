import { Create, useForm } from '@refinedev/antd';
import { Form, Input, Select, Switch } from 'antd';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export function StrategiesCreate() {
  const navigate = useNavigate();
  const { formProps } = useForm({
    resource: 'strategies',
    action: 'create',
    redirect: false,
  });

  const handleFinish = async (values: any) => {
    const token = localStorage.getItem('auth_token');
    await fetch(`${API_URL}/strategies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(values),
    });
    navigate('/strategies');
  };

  return (
    <Create>
      <Form {...formProps} onFinish={handleFinish} layout="vertical">
        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        
        <Form.Item label="Symbols" name="symbols">
          <Input placeholder="BTC/USD,ETH/USD" />
        </Form.Item>
        
        <Form.Item label="Intervals" name="intervals">
          <Select mode="multiple" placeholder="Select intervals">
            <Select.Option value="1m">1m</Select.Option>
            <Select.Option value="5m">5m</Select.Option>
            <Select.Option value="15m">15m</Select.Option>
            <Select.Option value="1h">1h</Select.Option>
            <Select.Option value="4h">4h</Select.Option>
            <Select.Option value="1d">1d</Select.Option>
          </Select>
        </Form.Item>
        
        <Form.Item label="Enabled" name="enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Create>
  );
}

export default StrategiesCreate;
