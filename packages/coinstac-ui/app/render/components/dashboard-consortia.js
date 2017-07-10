import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Button } from 'react-bootstrap';
import { LinkContainer } from 'react-router-bootstrap';
import ConsortiumCard from './consortium-card';
import { connect } from 'react-redux';
import {
  deleteConsortium,
  joinConsortium,
  leaveConsortium,
} from '../state/ducks/consortia';

class DashboardConsortia extends Component {
  renderConsortia() {
    const { consortia, user: { username } } = this.props;

    return (
      <div>
        {consortia.map((consortium, index) => {
          const { _id: id, owners, users } = consortium;
          const isMember = users.indexOf(username) > -1;
          const isOwner = owners.indexOf(username) > -1;

          return (
            <ConsortiumCard
              deleteConsortium={() => this.props.deleteConsortium(id)}
              isMember={isMember}
              isOwner={isOwner}
              joinConsortium={() => this.props.joinConsortium(id, username)}
              key={index}
              leaveConsortium={() => this.props.leaveConsortium(id, username)}
              {...consortium}
            />
          );
        })}
      </div>
    );
  }

  render() {
    const { consortia, loading } = this.props;
    let content;
    if (loading.isLoading) {
      content = (<span></span>);
    } else if (consortia) {
      content = this.renderConsortia();
    }

    return (
      <div className="dashboard-consortia">
        <div className="page-header clearfix">
          <h1 className="pull-left">Consortia</h1>
          <LinkContainer className="pull-right" to="/consortia/new">
            <Button bsStyle="primary" className="pull-right">
              <span aria-hidden="true" className="glphicon glyphicon-plus"></span>
              {' '}
              Add Consortium
            </Button>
          </LinkContainer>
        </div>
        {content}
      </div>
    );
  }
}

DashboardConsortia.propTypes = {
  loading: PropTypes.object,
  consortia: PropTypes.array,
  user: PropTypes.object.isRequired,
};

function mapStateToProps({ loading, consortia, auth: { user } }) {
  return { consortia, loading, user };
}

export default connect(mapStateToProps, {
  deleteConsortium,
  joinConsortium,
  leaveConsortium,
})(DashboardConsortia);
