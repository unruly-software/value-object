import {describe, it, expect, expectTypeOf} from 'vitest'
import z from 'zod'
import {ValueObject} from '../src'

describe('Integration Tests - Real-world Scenarios', () => {
  describe('E-commerce Domain Model', () => {
    class Email extends ValueObject.define({
      id: 'Email',
      schema: () => z.string().email()
    }) {}

    class Money extends ValueObject.define({
      id: 'Money',
      schema: () => z.object({
        amount: z.number().min(0),
        currency: z.enum(['USD', 'EUR', 'GBP'])
      }),
      toJSON: (props) => `${props.amount} ${props.currency}`
    }) {}

    class ProductId extends ValueObject.define({
      id: 'ProductId',
      schema: () => z.string().uuid()
    }) {}

    class UserId extends ValueObject.define({
      id: 'UserId',
      schema: () => z.string().uuid()
    }) {}

    class Address extends ValueObject.define({
      id: 'Address',
      schema: () => z.object({
        street: z.string().min(1),
        city: z.string().min(1),
        state: z.string().min(2).max(2),
        zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
        country: z.string().default('US')
      })
    }) {}

    // Product variant using discriminated union
    class PhysicalProduct extends ValueObject.define({
      id: 'PhysicalProduct',
      schema: () => z.object({
        type: z.literal('physical'),
        weight: z.number().min(0),
        dimensions: z.object({
          length: z.number().min(0),
          width: z.number().min(0),
          height: z.number().min(0)
        }),
        requiresShipping: z.boolean().default(true)
      })
    }) {}

    class DigitalProduct extends ValueObject.define({
      id: 'DigitalProduct',
      schema: () => z.object({
        type: z.literal('digital'),
        downloadUrl: z.string().url(),
        fileSize: z.number().min(0),
        expiresAt: z.date().optional()
      })
    }) {}

    class ServiceProduct extends ValueObject.define({
      id: 'ServiceProduct',
      schema: () => z.object({
        type: z.literal('service'),
        duration: z.number().min(1),
        location: z.enum(['online', 'onsite', 'hybrid']).default('online')
      })
    }) {}

    const ProductVariant = ValueObject.defineUnion('type', [
      PhysicalProduct,
      DigitalProduct,
      ServiceProduct,
    ])

    // Complex entities with nested value objects
    class Product extends ValueObject.define({
      id: 'Product',
      schema: () => z.object({
        id: ProductId.schema(),
        name: z.string().min(1),
        description: z.string().optional(),
        price: Money.schema(),
        variant: ProductVariant.schema(),
        tags: z.array(z.string()).default([]),
        isActive: z.boolean().default(true),
        metadata: z.record(z.string(), z.unknown()).optional()
      })
    }) {}

    class OrderItem extends ValueObject.define({
      id: 'OrderItem',
      schema: () => z.object({
        product: Product.schema(),
        quantity: z.number().int().min(1),
        unitPrice: Money.schema(),
        totalPrice: Money.schema().optional() // Calculated field
      }).transform(item => {
        // Auto-calculate total if not provided
        if (!item.totalPrice) {
          return {
            ...item,
            totalPrice: new Money({
              amount: item.unitPrice.props.amount * item.quantity,
              currency: item.unitPrice.props.currency
            })
          }
        }
        return item
      })
    }) {}

    class Customer extends ValueObject.define({
      id: 'Customer',
      schema: () => z.object({
        id: UserId.schema(),
        email: Email.schema(),
        name: z.string().min(1),
        addresses: z.array(Address.schema()).default([]),
        preferences: z.object({
          newsletter: z.boolean().default(false),
          notifications: z.boolean().default(true)
        })
      })
    }) {}

    class Order extends ValueObject.define({
      id: 'Order',
      schema: () => z.object({
        id: z.string().uuid(),
        customer: Customer.schema(),
        items: z.array(OrderItem.schema()).min(1),
        shippingAddress: Address.schema().optional(),
        billingAddress: Address.schema(),
        status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']).default('pending'),
        createdAt: z.date().default(() => new Date()),
        notes: z.string().optional()
      })
    }) {}

    it('should create a complete e-commerce order with nested value objects', () => {
      const orderData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        customer: {
          id: '987fcdeb-51a2-43d1-9f4b-123456789abc',
          email: 'john.doe@example.com',
          name: 'John Doe',
          addresses: [{
            street: '123 Main St',
            city: 'Anytown',
            state: 'CA',
            zipCode: '90210'
          }],
          preferences: {}
        },
        items: [{
          product: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Wireless Headphones',
            description: 'High-quality wireless headphones',
            price: {amount: 199.99, currency: 'USD' as const},
            variant: {
              type: 'physical' as const,
              weight: 0.5,
              dimensions: {length: 8, width: 6, height: 3}
            },
            tags: ['electronics', 'audio']
          },
          quantity: 2,
          unitPrice: {amount: 199.99, currency: 'USD' as const},
        }],
        billingAddress: {
          street: '456 Oak Ave',
          city: 'Somewhere',
          state: 'NY',
          zipCode: '10001'
        }
      }

      const clonedData = JSON.parse(JSON.stringify(orderData)) // Deep clone to verify immutability

      const order = Order.fromJSON(orderData)

      expect(order).toBeInstanceOf(Order)
      expect(order.props.customer).toBeInstanceOf(Customer)
      expect(order.props.customer.props.email).toBeInstanceOf(Email)
      expect(order.props.customer.props.addresses[0]).toBeInstanceOf(Address)
      expect(order.props.items[0]).toBeInstanceOf(OrderItem)
      expect(order.props.items[0].props.product).toBeInstanceOf(Product)
      expect(order.props.items[0].props.product.props.price).toBeInstanceOf(Money)
      expect(order.props.items[0].props.totalPrice?.props.amount).toBe(399.98) // Auto-calculated
      expect(order.props.billingAddress).toBeInstanceOf(Address)

      // The original input object was deeply transformed with default values.
      expect(order.toJSON()).not.toEqual(orderData)

      // Verify that the original input data has not been mutated
      expect(orderData).toEqual(clonedData)

      const serialized = JSON.parse(JSON.stringify(order.toJSON()))
      expect((serialized)).toEqual(order.toJSON())
    })

    it('should handle different product variants correctly', () => {
      const physicalProduct = Product.fromJSON({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'T-Shirt',
        price: {amount: 29.99, currency: 'USD'},
        variant: {
          type: 'physical',
          weight: 0.2,
          dimensions: {length: 12, width: 8, height: 0.1}
        }
      })

      const digitalProduct = Product.fromJSON({
        id: '123e4567-e89b-12d3-a456-426614174002',
        name: 'Software License',
        price: {amount: 99.99, currency: 'USD'},
        variant: {
          type: 'digital',
          downloadUrl: 'https://example.com/download',
          fileSize: 1024000
        }
      })

      const serviceProduct = Product.fromJSON({
        id: '123e4567-e89b-12d3-a456-426614174003',
        name: 'Consulting Session',
        price: {amount: 150.00, currency: 'USD'},
        variant: {
          type: 'service',
          duration: 60
        }
      })

      expect(physicalProduct.props.variant).toBeInstanceOf(PhysicalProduct)
      expect(digitalProduct.props.variant).toBeInstanceOf(DigitalProduct)
      expect(serviceProduct.props.variant).toBeInstanceOf(ServiceProduct)

      // Type narrowing should work
      if (physicalProduct.props.variant.props.type === 'physical') {
        expect(physicalProduct.props.variant.props.requiresShipping).toBe(true)
      }
    })

    it('should serialize complex order to JSON correctly', () => {
      const order = Order.fromJSON({
        id: '123e4567-e89b-12d3-a456-426614174000',
        customer: {
          preferences: {},
          id: '987fcdeb-51a2-43d1-9f4b-123456789abc',
          email: 'jane@example.com',
          name: 'Jane Smith'
        },
        items: [{
          product: {
            id: '123e4567-e89b-12d3-a456-426614174004',
            name: 'Book',
            price: {amount: 15.99, currency: 'USD'},
            variant: {
              type: 'physical',
              weight: 0.3,
              dimensions: {length: 9, width: 6, height: 1}
            }
          },
          quantity: 1,
          unitPrice: {amount: 15.99, currency: 'USD'}
        }],
        billingAddress: {
          street: '789 Pine St',
          city: 'Testville',
          state: 'TX',
          zipCode: '75001'
        }
      })

      const json = order.toJSON()

      // Money should be serialized as string
      expect(json.items[0].product.price).toBe('15.99 USD')
      expect(json.items[0].unitPrice).toBe('15.99 USD')
      expect(json.items[0].totalPrice).toBe('15.99 USD')

      // Other nested objects should be properly serialized
      expect(json.customer.email).toBe('jane@example.com')
      expect(json.billingAddress.zipCode).toBe('75001')
    })
  })

  describe('Form Library Integration', () => {
    class FormField extends ValueObject.define({
      id: 'FormField',
      schema: () => z.object({
        name: z.string().min(1),
        value: z.string(),
        required: z.boolean().default(false),
        errors: z.array(z.string()).default([])
      })
    }) {}

    class ContactForm extends ValueObject.define({
      id: 'ContactForm',
      schema: () => z.object({
        name: FormField.schema(),
        email: FormField.schema(),
        message: FormField.schema(),
        consent: FormField.schema()
      })
    }) {}

    it('should handle form validation with nested field errors', () => {
      const formSchema = z.object({
        contactForm: ContactForm.schema()
      })

      const invalidFormData = {
        contactForm: {
          name: {name: 'name', value: '', required: true},
          email: {name: 'email', value: 'invalid-email', required: true},
          message: {name: 'message', value: 'Hello world', required: true},
          consent: {name: 'consent', value: 'false', required: true}
        }
      }

      const result = formSchema.safeParse(invalidFormData)
      expect(result.success).toBe(true) // The form data is valid structure-wise

      if (result.success) {
        expect(result.data.contactForm).toBeInstanceOf(ContactForm)
        expect(result.data.contactForm.props.name).toBeInstanceOf(FormField)
      }
    })

    it('should create valid form with proper field structure', () => {
      const form = ContactForm.fromJSON({
        name: {name: 'name', value: 'John Doe', required: true},
        email: {name: 'email', value: 'john@example.com', required: true},
        message: {name: 'message', value: 'Hello there!', required: true},
        consent: {name: 'consent', value: 'true', required: true}
      })

      expect(form.props.name).toBeInstanceOf(FormField)
      expect(form.props.email.props.value).toBe('john@example.com')
      expect(form.props.message.props.required).toBe(true)
    })
  })

  describe('Domain Events and State Management', () => {
    class EventId extends ValueObject.define({
      id: 'EventId',
      schema: () => z.string().uuid()
    }) {}

    class Timestamp extends ValueObject.define({
      id: 'Timestamp',
      schema: () => z.date(),
      toJSON: (date) => date.toISOString()
    }) {}

    class EventEmail extends ValueObject.define({
      id: 'EventEmail',
      schema: () => z.string().email()
    }) {}

    class UserRegistered extends ValueObject.define({
      id: 'UserRegistered',
      schema: () => z.object({
        type: z.literal('user_registered'),
        eventId: EventId.schema(),
        timestamp: Timestamp.schema(),
        userId: z.string().uuid(),
        email: EventEmail.schema(),
        metadata: z.record(z.string(), z.unknown()).optional()
      })
    }) {}

    class OrderPlaced extends ValueObject.define({
      id: 'OrderPlaced',
      schema: () => z.object({
        type: z.literal('order_placed'),
        eventId: EventId.schema(),
        timestamp: Timestamp.schema(),
        orderId: z.string().uuid(),
        customerId: z.string().uuid(),
        totalAmount: z.object({
          amount: z.number(),
          currency: z.string()
        })
      })
    }) {}

    const DomainEvent = ValueObject.defineUnion('type', [
      UserRegistered,
      OrderPlaced,
    ])

    class EventStore extends ValueObject.define({
      id: 'EventStore',
      schema: () => z.object({
        events: z.array(DomainEvent.schema()),
        version: z.number().int().min(0).default(0)
      })
    }) {}

    it('should handle event sourcing patterns', () => {
      const events = [
        {
          type: 'user_registered' as const,
          eventId: '123e4567-e89b-12d3-a456-426614174005',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          userId: '123e4567-e89b-12d3-a456-426614174006',
          email: 'user@example.com',
          metadata: {source: 'web'}
        },
        {
          type: 'order_placed' as const,
          eventId: '123e4567-e89b-12d3-a456-426614174007',
          timestamp: new Date('2024-01-01T11:00:00Z'),
          orderId: '123e4567-e89b-12d3-a456-426614174008',
          customerId: '123e4567-e89b-12d3-a456-426614174006',
          totalAmount: {amount: 99.99, currency: 'USD'}
        }
      ]

      const eventStore = EventStore.fromJSON({events})

      expect(eventStore.props.events).toHaveLength(2)
      expect(eventStore.props.events[0]).toBeInstanceOf(UserRegistered)
      expect(eventStore.props.events[1]).toBeInstanceOf(OrderPlaced)

      // Verify nested value objects are properly created
      const userRegisteredEvent = eventStore.props.events[0] as UserRegistered
      expect(userRegisteredEvent.props.eventId).toBeInstanceOf(EventId)
      expect(userRegisteredEvent.props.timestamp).toBeInstanceOf(Timestamp)
      expect(userRegisteredEvent.props.email).toBeInstanceOf(EventEmail)
    })

    it('should serialize events with proper timestamp formatting', () => {
      const event = UserRegistered.fromJSON({
        type: 'user_registered',
        eventId: '123e4567-e89b-12d3-a456-426614174009',
        timestamp: new Date('2024-01-01T10:00:00.000Z'),
        userId: '123e4567-e89b-12d3-a456-426614174010',
        email: 'test@example.com'
      })

      const json = event.toJSON()
      expect(json.timestamp).toBe('2024-01-01T10:00:00.000Z')
      expect(json.email).toBe('test@example.com')
    })
  })

  describe('API Response Modeling', () => {
    class ApiSuccess extends ValueObject.define({
      id: 'ApiSuccess',
      schema: () => z.object({
        status: z.literal('success'),
        data: z.unknown(),
        timestamp: z.date().default(() => new Date())
      })
    }) {}

    class ApiError extends ValueObject.define({
      id: 'ApiError',
      schema: () => z.object({
        status: z.literal('error'),
        error: z.object({
          code: z.string(),
          message: z.string(),
          details: z.unknown().optional()
        }),
        timestamp: z.date().default(() => new Date())
      })
    }) {}

    const ApiResponse = ValueObject.defineUnion('status', [ApiSuccess, ApiError])

    it('should model API responses with proper discrimination', () => {
      const successResponse = ApiResponse.fromJSON({
        status: 'success',
        data: {users: [{id: 1, name: 'John'}]}
      })

      const errorResponse = ApiResponse.fromJSON({
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input parameters',
          details: {field: 'email', issue: 'Invalid format'}
        }
      })

      expect(successResponse).toBeInstanceOf(ApiSuccess)
      expect(errorResponse).toBeInstanceOf(ApiError)

      // Type narrowing should work in real usage
      if (successResponse.props.status === 'success') {
        expect(successResponse.props.data).toEqual({users: [{id: 1, name: 'John'}]})
      }

      if (errorResponse.props.status === 'error') {
        expect(errorResponse.props.error.code).toBe('VALIDATION_ERROR')
      }
    })

    it('should handle nested API response with value objects', () => {
      const userListResponse = ApiResponse.fromJSON({
        status: 'success',
        data: {
          users: [{
            id: '11111111-1111-1111-1111-111111111111',
            email: 'user1@example.com',
            profile: {
              name: 'User One',
              address: {
                street: '123 Main St',
                city: 'Testville',
                state: 'CA',
                zipCode: '90210'
              }
            }
          }],
          pagination: {
            page: 1,
            limit: 10,
            total: 1
          }
        }
      })

      expect(userListResponse).toBeInstanceOf(ApiSuccess)
      const jsonResponse = userListResponse.toJSON()
      expect(jsonResponse.status).toBe('success')
      if (jsonResponse.status === 'success') {
        expect(jsonResponse.data).toHaveProperty('users')
      } else {
        expect.fail('Expected success response')
      }

    })
  })

  describe('Type Safety in Complex Scenarios', () => {
    // Re-use previous value objects for type checking
    class Email extends ValueObject.define({
      id: 'Email',
      schema: () => z.string().email()
    }) {}

    class Money extends ValueObject.define({
      id: 'Money',
      schema: () => z.object({
        amount: z.number(),
        currency: z.string()
      })
    }) {}

    it('should maintain type safety across complex nested structures', () => {
      class ComplexEntity extends ValueObject.define({
        id: 'ComplexEntity',
        schema: () => z.object({
          id: z.string(),
          emails: z.array(Email.schema()),
          prices: z.record(z.string(), Money.schema()),
          metadata: z.object({
            tags: z.array(z.string()),
            settings: z.record(z.string(), z.boolean())
          }).optional()
        })
      }) {}

      const entity = ComplexEntity.fromJSON({
        id: 'test',
        emails: ['test1@example.com', 'test2@example.com'],
        prices: {
          'regular': {amount: 100, currency: 'USD'},
          'sale': {amount: 80, currency: 'USD'}
        },
        metadata: {
          tags: ['featured', 'new'],
          settings: {visible: true, featured: false}
        }
      })

      // Type assertions to verify correct types are inferred
      expectTypeOf(entity.props.emails).toEqualTypeOf<Email[]>()
      expectTypeOf(entity.props.prices).toEqualTypeOf<Record<string, Money>>()
      expectTypeOf(entity.props.metadata?.tags).toEqualTypeOf<string[] | undefined>()

      // Runtime verification
      expect(entity.props.emails[0]).toBeInstanceOf(Email)
      expect(entity.props.prices.regular).toBeInstanceOf(Money)
      expect(entity.props.metadata?.tags).toEqual(['featured', 'new'])
    })
  })
})
