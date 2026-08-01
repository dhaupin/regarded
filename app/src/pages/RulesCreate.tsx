import { Create, useForm } from '@refinedev/antd';
import { Form, Input, Select, Switch } from 'antd';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export function RulesCreate() {
  const navigate = useNavigate();
  const { formProps } = useForm({
    resource: 'rules',
    action: 'create',
    redirect: false,
  });

  const handleFinish = async (values: any) => {
    const token = localStorage.getItem('auth_token');
    await fetch(`${API_URL}/rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(values),
    });
    navigate('/rules');
  };

  return (
    <Create>
      <Form {...formProps} onFinish={handleFinish} layout="vertical">
        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        
        <Form.Item label="Condition Logic" name="condition_logic">
          <Select>
            <Select.Option value="and">AND</Select.Option>
            <Select.Option value="or">OR</Select.Option>
          </Select>
        </Form.Item>
        
        <Form.Item label="Trigger Type" name="trigger_type">
          <Select placeholder="Select trigger type">
            <Select.Option value="trade">Trade</Select.Option>
            <Select.Option value="notify">Notify</Select.Option>
            <Select.Option value="adjust_risk">Adjust Risk</Select.Option>
          </Select>
        </Form.Item>
        
        <Form.Item label="Enabled" name="enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Create>
  );
}

export default RulesCreate;
