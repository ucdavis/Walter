import { createFormHookContexts, createFormHook } from '@tanstack/react-form';
import { TextField } from './TextField.tsx';
import { SubscribeButton } from './SubscribeButton.tsx';
import { SelectField } from './SelectField.tsx';

// export useFieldContext for use in your custom components
export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

const { useAppForm } = createFormHook({
  fieldComponents: {
    // text, select, checkbox, etc.
    SelectField,
    TextField,
  },
  fieldContext,
  formComponents: {
    // submit buttons and such
    SubscribeButton,
  },
  formContext,
});

export { useAppForm };
