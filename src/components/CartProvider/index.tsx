import * as React from "react";

import { ApolloClient, ApolloError } from "apollo-client";
import {
  CheckoutContext,
  CheckoutContextInterface
} from "../../checkout/context";
import {
  getCheckoutQuery,
  updateCheckoutLineQuery
} from "../../checkout/queries";
import {
  updateCheckoutLine,
  updateCheckoutLineVariables
} from "../../checkout/types/updateCheckoutLine";
import { maybe } from "../../core/utils";
import { productVariatnsQuery } from "../../views/Product/queries";
import {
  VariantList,
  VariantListVariables
} from "../../views/Product/types/VariantList";
import { CartContext, CartInterface, CartLineInterface } from "./context";

export default class CartProvider extends React.Component<
  { children: any; apolloClient: ApolloClient<any> },
  CartInterface
> {
  static contextType = CheckoutContext;
  static getQuantity = lines =>
    lines.reduce((sum, line) => sum + line.quantity, 0);
  static getTotal = (lines): { amount: number; currency: string } => {
    const amount = lines.reduce(
      (sum, line) => sum + line.variant.price.amount * line.quantity,
      0
    );
    const { currency } = lines[0].variant.price;
    return { amount, currency };
  };

  context: CheckoutContextInterface;

  constructor(props) {
    super(props);

    let lines;
    try {
      lines = JSON.parse(localStorage.getItem("cart")) || [];
    } catch {
      lines = [];
    }

    this.state = {
      add: this.add,
      changeQuantity: this.changeQuantity,
      clear: this.clear,
      clearErrors: this.clearErrors,
      errors: null,
      fetch: this.fetch,
      getQuantity: this.getQuantity,
      getTotal: this.getTotal,
      lines,
      loading: false,
      remove: this.remove,
      subtract: this.subtract
    };
  }

  getLine = (variantId: string): CartLineInterface =>
    this.state.lines.find(line => line.variantId === variantId);

  changeQuantity = async (variantId, quantity) => {
    this.setState({ loading: true });

    const checkoutID = maybe(() => this.context.checkout.id);
    let apiError = false;

    if (checkoutID) {
      const { apolloClient } = this.props;
      const {
        data: {
          checkoutLinesUpdate: { errors, checkout }
        }
      } = await apolloClient.mutate<
        updateCheckoutLine,
        updateCheckoutLineVariables
      >({
        mutation: updateCheckoutLineQuery,
        update: (cache, { data: { checkoutLinesUpdate } }) => {
          cache.writeQuery({
            data: {
              checkout: checkoutLinesUpdate.checkout
            },
            query: getCheckoutQuery
          });
        },
        variables: {
          checkoutId: checkoutID,
          lines: [
            {
              quantity,
              variantId
            }
          ]
        }
      });
      apiError = !!errors.length;
      if (apiError) {
        this.setState({
          errors: [...errors],
          loading: false
        });
      } else {
        this.context.update({ checkout });
      }
    }

    if (!apiError) {
      const newLine = { quantity, variantId };
      this.setState(prevState => {
        let lines = prevState.lines.filter(
          line => line.variantId !== variantId
        );
        if (newLine.quantity > 0) {
          lines = [...lines, newLine];
        }
        return { lines, loading: false };
      });
    }
  };

  add = (variantId, quantity = 1) => {
    const line = this.getLine(variantId);
    const newQuantity = line ? line.quantity + quantity : quantity;
    this.changeQuantity(variantId, newQuantity);
  };

  subtract = (variantId, quantity = 1) => {
    const line = this.getLine(variantId);
    const newQuantity = line ? line.quantity - quantity : quantity;
    this.changeQuantity(variantId, newQuantity);
  };

  clear = () => this.setState({ lines: [], errors: [] });

  clearErrors = () => this.setState({ errors: [] });

  fetch = async () => {
    const cart = JSON.parse(localStorage.getItem("cart")) || [];

    if (cart.length) {
      this.setState({ loading: true });
      let lines;
      const { apolloClient } = this.props;
      const { data, errors } = await apolloClient.query<
        VariantList,
        VariantListVariables
      >({
        query: productVariatnsQuery,
        variables: {
          ids: cart.map(line => line.variantId)
        }
      });
      const quantityMapping = cart.reduce((obj, line) => {
        obj[line.variantId] = line.quantity;
        return obj;
      }, {});
      lines = data.productVariants
        ? data.productVariants.edges.map(variant => ({
            quantity: quantityMapping[variant.node.id],
            variant: variant.node,
            variantId: variant.node.id
          }))
        : [];

      this.setState({
        errors: errors ? [new ApolloError({ graphQLErrors: errors })] : null,
        lines: errors ? [] : lines,
        loading: false
      });
    }
  };

  getQuantity = () => CartProvider.getQuantity(this.state.lines);

  getTotal = () => CartProvider.getTotal(this.state.lines);

  remove = variantId => this.changeQuantity(variantId, 0);

  componentDidUpdate(prevProps, prevState) {
    if (JSON.stringify(this.state.lines) !== JSON.stringify(prevState.lines)) {
      localStorage.setItem("cart", JSON.stringify(this.state.lines));
    }
  }
  render() {
    return (
      <CartContext.Provider value={this.state}>
        {this.props.children}
      </CartContext.Provider>
    );
  }
}
