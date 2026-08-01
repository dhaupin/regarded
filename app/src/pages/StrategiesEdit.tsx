import { Edit, useForm } from '@refinedev/antd';
import { useOne } from '@refinedev/core';
import { Form, Input, Select, Switch, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export function StrategiesEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { formProps, queryResult } = useForm({
    resource: 'strategies',
    action: 'edit',
    id,
  });

  const { data: strategy } = useOne({
    resource: 'strategies',
    id,
  });

  const handleFinish = async (values: any) => {
    const token = localStorage.getItem('auth_token');
    await fetch(`${API_URL}/strategies/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(values),
    });
    navigate('/strategies');
  };

  if (queryResult?.isLoading) {
    return <Spin />;
  }

  return (
    <Edit>
      <Form {...formProps} onFinish={handleFinish} layout="vertical" initialValues={strategy?.data}>
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
    </Edit>
  );
}

export default StrategiesEdit;
