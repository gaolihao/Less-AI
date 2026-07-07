import Gauge from '../components/Gauge';
import '../App.css';

export default {
  title: 'Components/Gauge',
  component: Gauge,
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
    },
  },
};

export const Empty = {
  args: {
    value: null,
  },
};

export const Low = {
  args: {
    value: 25,
  },
};

export const Medium = {
  args: {
    value: 50,
  },
};

export const High = {
  args: {
    value: 85,
  },
};
