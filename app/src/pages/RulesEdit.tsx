import { Edit, useForm } from '@refinedev/antd';
import { useOne } from '@refinedev/core';
import { Form, Input, Select, Switch, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export function RulesEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { formProps, queryResult } = useForm({
    resource: 'rules',
    action: 'edit',
    id,
  });

  const { data: rule } = useOne({
    resource: 'rules',
    id,
  });

  const handleFinish = async (values: any) => {
    const token = localStorage.getItem('auth_token');
    await fetch(`${API_URL}/rules/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(values),
    });
    navigate('/rules');
  };

  if (queryResult?.isLoading) {
    return <Spin />;
  }

  return (
    <Edit>
      <Form {...formProps} onFinish={handleFinish} layout="vertical" initialValues={rule?.data}>
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
    </Edit>
  );
}

export default RulesEdit;
